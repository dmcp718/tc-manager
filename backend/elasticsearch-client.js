const { Client } = require('@elastic/elasticsearch');
const path = require('path');

class ElasticsearchClient {
  constructor(config = {}) {
    this.host = config.host || process.env.ELASTICSEARCH_HOST || 'localhost';
    this.port = config.port || process.env.ELASTICSEARCH_PORT || 9200;
    this.indexName = config.indexName || process.env.ELASTICSEARCH_INDEX || 'sitecache-files';
    
    // Initialize Elasticsearch client
    this.client = new Client({
      node: `http://${this.host}:${this.port}`,
      requestTimeout: 60000,
      pingTimeout: 3000,
      maxRetries: 3
    });
    
    console.log(`Elasticsearch client initialized: ${this.host}:${this.port}, index: ${this.indexName}`);
  }

  /**
   * Test connection to Elasticsearch
   */
  async testConnection() {
    try {
      const response = await this.client.ping();
      console.log('Elasticsearch connection successful');
      return true;
    } catch (error) {
      console.error('Elasticsearch connection failed:', error.message);
      return false;
    }
  }

  /**
   * Ensure index exists with proper mapping
   */
  async ensureIndexExists() {
    try {
      const exists = await this.client.indices.exists({ index: this.indexName });
      
      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: this.createIndexMapping()
        });
        console.log(`Created Elasticsearch index: ${this.indexName}`);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to ensure index exists:', error.message);
      throw error;
    }
  }

  /**
   * Create index mapping optimized for file system data
   */
  createIndexMapping() {
    return {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        refresh_interval: "30s",
        analysis: {
          analyzer: {
            path_analyzer: {
              tokenizer: "path_tokenizer",
              filter: ["lowercase"]
            }
          },
          tokenizer: {
            path_tokenizer: {
              type: "path_hierarchy",
              delimiter: "/"
            }
          }
        }
      },
      mappings: {
        properties: {
          id: { type: "keyword" },
          path: {
            type: "text",
            fields: {
              keyword: { type: "keyword" },
              hierarchy: { 
                type: "text", 
                analyzer: "path_analyzer" 
              }
            }
          },
          name: {
            type: "text",
            fields: {
              keyword: { type: "keyword" }
            }
          },
          parent_path: { type: "keyword" },
          is_directory: { type: "boolean" },
          size: { type: "long" },
          size_formatted: { type: "keyword" },
          modified_at: { type: "date" },
          permissions: { type: "keyword" },
          cached: { type: "boolean" },
          cached_at: { type: "date" },
          extension: { type: "keyword" },
          indexed_at: { type: "date" },
          // Metadata as object for flexible searching
          metadata: { type: "object" }
        }
      }
    };
  }

  /**
   * Format file data for Elasticsearch indexing
   */
  formatFileDocument(fileData) {
    const doc = {
      id: fileData.id || fileData.path,
      path: fileData.path,
      name: fileData.name,
      parent_path: fileData.parent_path,
      is_directory: fileData.is_directory,
      size: fileData.size || 0,
      size_formatted: this.formatFileSize(fileData.size || 0),
      modified_at: fileData.modified_at,
      permissions: fileData.permissions,
      cached: fileData.cached || false,
      cached_at: fileData.cached_at,
      extension: fileData.is_directory ? null : path.extname(fileData.name).toLowerCase(),
      indexed_at: new Date().toISOString(),
      metadata: fileData.metadata || {}
    };

    return doc;
  }

  /**
   * Format file size in human readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Index a single file
   */
  async indexFile(fileData) {
    try {
      const doc = this.formatFileDocument(fileData);
      
      const response = await this.client.index({
        index: this.indexName,
        id: doc.id,
        body: doc
      });
      
      return response;
    } catch (error) {
      console.error('Failed to index file:', error.message);
      throw error;
    }
  }

  /**
   * Bulk index multiple files
   */
  async bulkIndexFiles(filesData) {
    if (!filesData || filesData.length === 0) {
      return { indexed: 0, errors: [] };
    }

    try {
      const body = [];
      
      for (const fileData of filesData) {
        const doc = this.formatFileDocument(fileData);
        
        // Add index action
        body.push({
          index: {
            _index: this.indexName,
            _id: doc.id
          }
        });
        
        // Add document
        body.push(doc);
      }

      const response = await this.client.bulk({
        refresh: true,
        body: body
      });

      // Count successes and errors
      let indexed = 0;
      const errors = [];

      if (response.items) {
        response.items.forEach((item, index) => {
          if (item.index.status >= 200 && item.index.status < 300) {
            indexed++;
          } else {
            errors.push({
              index: index,
              error: item.index.error,
              path: filesData[index]?.path
            });
          }
        });
      }

      console.log(`Bulk indexed ${indexed} files, ${errors.length} errors`);
      
      return { indexed, errors };
    } catch (error) {
      console.error('Bulk indexing failed:', error.message);
      throw error;
    }
  }

  /**
   * Search files with query
   */
  async searchFiles(query, options = {}) {
    const {
      size = 100,
      from = 0,
      filters = {},
      sortBy = 'name.keyword',
      sortOrder = 'asc'
    } = options;

    try {
      const searchBody = {
        query: this.buildSearchQuery(query, filters),
        sort: [
          // Always sort directories first, then by specified field
          { is_directory: { order: 'desc' } },
          { [sortBy]: { order: sortOrder } }
        ],
        size,
        from
      };

      const response = await this.client.search({
        index: this.indexName,
        body: searchBody
      });

      const hits = response.hits.hits.map(hit => ({
        ...hit._source,
        _score: hit._score
      }));

      return {
        hits,
        total: response.hits.total.value || response.hits.total,
        took: response.took
      };
    } catch (error) {
      console.error('Search failed:', error.message);
      throw error;
    }
  }

  /**
   * Build Elasticsearch query from search string and filters
   */
  buildSearchQuery(query, filters = {}) {
    const must = [];
    const filter = [];

    // Text search
    if (query && query.trim() && query !== '*') {
      // Parse boolean operators
      if (this.containsBooleanOperators(query)) {
        // For boolean queries, split terms and use wildcard matching
        const terms = query.split(/\s+(AND|OR|NOT)\s+/i).filter(term => 
          !['AND', 'OR', 'NOT'].includes(term.toUpperCase())
        );
        
        if (terms.length > 1) {
          // Multiple terms - use wildcard matching for each
          const termQueries = terms.map(term => ({
            bool: {
              should: [
                { wildcard: { "name": `*${term.toLowerCase()}*` } },
                { wildcard: { "path": `*${term.toLowerCase()}*` } }
              ],
              minimum_should_match: 1
            }
          }));
          
          // For AND queries, all terms must match
          if (query.toUpperCase().includes(' AND ')) {
            must.push({
              bool: {
                must: termQueries
              }
            });
          } else {
            // For OR queries, any term can match
            must.push({
              bool: {
                should: termQueries,
                minimum_should_match: 1
              }
            });
          }
        } else {
          // Single term with boolean operators - fall back to query_string
          must.push({
            query_string: {
              query: query,
              fields: ["path^2", "name^3", "path.hierarchy"],
              default_operator: "AND"
            }
          });
        }
      } else {
        // Use wildcard queries for better filename matching (handles underscores, etc.)
        const wildcardQuery = `*${query.toLowerCase()}*`;
        
        must.push({
          bool: {
            should: [
              // Exact term matching
              {
                multi_match: {
                  query: query,
                  fields: ["path^2", "name^3", "path.hierarchy"],
                  type: "best_fields",
                  fuzziness: "AUTO"
                }
              },
              // Wildcard matching for filenames with special characters
              {
                wildcard: {
                  "name": wildcardQuery
                }
              },
              {
                wildcard: {
                  "path": wildcardQuery
                }
              }
            ],
            minimum_should_match: 1
          }
        });
      }
    }

    // Apply filters
    if (filters.is_directory !== undefined) {
      filter.push({ term: { is_directory: filters.is_directory } });
    }

    if (filters.cached !== undefined) {
      filter.push({ term: { cached: filters.cached } });
    }

    if (filters.extension) {
      filter.push({ term: { extension: filters.extension } });
    }

    if (filters.size_min || filters.size_max) {
      const range = {};
      if (filters.size_min) range.gte = filters.size_min;
      if (filters.size_max) range.lte = filters.size_max;
      filter.push({ range: { size: range } });
    }

    if (filters.modified_after || filters.modified_before) {
      const range = {};
      if (filters.modified_after) range.gte = filters.modified_after;
      if (filters.modified_before) range.lte = filters.modified_before;
      filter.push({ range: { modified_at: range } });
    }

    // If no query and no filters, match all
    if (must.length === 0 && filter.length === 0) {
      return { match_all: {} };
    }

    return {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter: filter
      }
    };
  }

  /**
   * Check if query contains boolean operators
   */
  containsBooleanOperators(query) {
    return /\b(AND|OR|NOT)\b/.test(query) || query.includes('+') || query.includes('-');
  }

  /**
   * Delete file from index
   */
  async deleteFile(filePath) {
    try {
      const response = await this.client.delete({
        index: this.indexName,
        id: filePath
      });
      
      return response;
    } catch (error) {
      if (error.meta?.statusCode === 404) {
        // File not found in index, which is fine
        return null;
      }
      console.error('Failed to delete file from index:', error.message);
      throw error;
    }
  }

  /**
   * Bulk delete multiple files from index by their paths
   */
  async bulkDeleteByPaths(paths) {
    if (!paths || paths.length === 0) {
      return { deleted: 0, errors: [] };
    }

    try {
      const body = [];
      
      for (const filePath of paths) {
        // Add delete action
        body.push({
          delete: {
            _index: this.indexName,
            _id: filePath
          }
        });
      }

      const response = await this.client.bulk({
        refresh: true,
        body: body
      });

      // Count successes and errors
      let deleted = 0;
      const errors = [];

      if (response.items) {
        response.items.forEach((item, index) => {
          const deleteResult = item.delete;
          if (deleteResult.status === 200 || deleteResult.status === 404) {
            // 200 = deleted, 404 = not found (which is fine)
            deleted++;
          } else {
            errors.push({
              index: index,
              error: deleteResult.error,
              path: paths[index]
            });
          }
        });
      }

      console.log(`Bulk deleted ${deleted} files from ES index, ${errors.length} errors`);
      
      return { deleted, errors };
    } catch (error) {
      console.error('Bulk deletion failed:', error.message);
      throw error;
    }
  }

  /**
   * Delete documents by query (useful for pattern-based cleanup)
   */
  async deleteByQuery(query) {
    try {
      const response = await this.client.deleteByQuery({
        index: this.indexName,
        body: {
          query: query
        },
        refresh: true
      });

      console.log(`Deleted ${response.deleted} documents by query`);
      return response;
    } catch (error) {
      console.error('Delete by query failed:', error.message);
      throw error;
    }
  }

  /**
   * Get search suggestions/autocomplete
   */
  async getSuggestions(query, size = 10) {
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: {
          suggest: {
            path_suggest: {
              prefix: query,
              completion: {
                field: "name.keyword",
                size: size
              }
            }
          },
          size: 0
        }
      });

      return response.suggest.path_suggest[0].options.map(option => ({
        text: option.text,
        score: option._score
      }));
    } catch (error) {
      console.error('Failed to get suggestions:', error.message);
      return [];
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats() {
    try {
      const response = await this.client.indices.stats({
        index: this.indexName
      });

      return {
        documents: response.indices[this.indexName].total.docs.count,
        size: response.indices[this.indexName].total.store.size_in_bytes
      };
    } catch (error) {
      console.error('Failed to get index stats:', error.message);
      return null;
    }
  }
}

module.exports = ElasticsearchClient;