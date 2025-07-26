#!/usr/bin/env node

const { Client } = require('@elastic/elasticsearch');

async function testTheirConfig() {
  console.log('🧪 Testing fs-indexer-elasticsearch exact configuration...\n');
  
  const client = new Client({
    node: 'http://localhost:9200',
    requestTimeout: 60000
  });
  
  const indexName = 'test-fs-indexer-config';
  
  try {
    // Delete existing index if it exists
    try {
      await client.indices.delete({ index: indexName });
    } catch (e) {}
    
    // Create index with fs-indexer-elasticsearch exact mapping
    await client.indices.create({
      index: indexName,
      body: {
        "settings": {
          "number_of_shards": 1,
          "number_of_replicas": 0,
          "refresh_interval": "30s",
          "analysis": {
            "analyzer": {
              "path_analyzer": {
                "tokenizer": "path_tokenizer",
                "filter": ["lowercase"]
              }
            },
            "tokenizer": {
              "path_tokenizer": {
                "type": "path_hierarchy",
                "delimiter": "/"
              }
            }
          }
        },
        "mappings": {
          "properties": {
            "id": {"type": "keyword"},
            "name": {
              "type": "text",
              "fields": {
                "keyword": {"type": "keyword"}
              }
            },
            "filepath": {
              "type": "text",
              "fields": {
                "keyword": {"type": "keyword"}
              },
              "analyzer": "path_analyzer"
            },
            "size_bytes": {"type": "long"},
            "size": {"type": "keyword"},
            "modified_time": {"type": "date"},
            "creation_time": {"type": "date"},
            "type": {"type": "keyword"},
            "extension": {"type": "keyword"}
          }
        }
      }
    });
    
    console.log('✅ Created index with fs-indexer-elasticsearch mapping');
    
    // Index test documents
    const testDocs = [
      {
        id: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        name: 'Farm00101_Proxy.mp4',
        filepath: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        size_bytes: 1048576,
        size: '1 MB',
        type: 'file',
        extension: 'mp4'
      },
      {
        id: '/00_Media/Farm/Proxies/Farm00102_Proxy.mp4',
        name: 'Farm00102_Proxy.mp4', 
        filepath: '/00_Media/Farm/Proxies/Farm00102_Proxy.mp4',
        size_bytes: 1048576,
        size: '1 MB',
        type: 'file',
        extension: 'mp4'
      }
    ];
    
    for (const doc of testDocs) {
      await client.index({
        index: indexName,
        id: doc.id,
        body: doc
      });
    }
    
    await client.indices.refresh({ index: indexName });
    console.log('✅ Indexed test documents');
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test searches
    console.log('\n📋 Testing searches:');
    
    // Test 1: Search for "Proxy"
    const result1 = await client.search({
      index: indexName,
      body: {
        query: {
          multi_match: {
            query: "Proxy",
            fields: ["name", "filepath"]
          }
        }
      }
    });
    console.log(`1. "Proxy" search: ${result1.hits.total.value} hits`);
    
    // Test 2: Search for "proxy" (lowercase)
    const result2 = await client.search({
      index: indexName,
      body: {
        query: {
          multi_match: {
            query: "proxy",
            fields: ["name", "filepath"]
          }
        }
      }
    });
    console.log(`2. "proxy" search: ${result2.hits.total.value} hits`);
    
    // Test 3: How name field analyzes
    const analyzeResult = await client.indices.analyze({
      index: indexName,
      body: {
        field: "name",
        text: "Farm00101_Proxy.mp4"
      }
    });
    console.log('3. Name field tokens:', analyzeResult.tokens.map(t => t.token));
    
    // Test 4: Query string search
    const result4 = await client.search({
      index: indexName,
      body: {
        query: {
          query_string: {
            query: "Proxy",
            fields: ["name", "filepath"]
          }
        }
      }
    });
    console.log(`4. Query string "Proxy": ${result4.hits.total.value} hits`);
    
    // Cleanup
    await client.indices.delete({ index: indexName });
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    try {
      await client.indices.delete({ index: indexName });
    } catch (e) {}
  }
}

testTheirConfig();