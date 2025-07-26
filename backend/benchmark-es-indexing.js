#!/usr/bin/env node

const { FileIndexer } = require('./indexer');
const ElasticsearchClient = require('./elasticsearch-client');
const fs = require('fs').promises;
const path = require('path');

async function benchmarkESIndexing() {
  console.log('🏁 Elasticsearch Indexing Benchmark');
  console.log('====================================\n');

  const mountPath = '/media/lucidlink-1';
  
  try {
    // Check if mount path exists
    console.log('1. Checking filesystem mount...');
    try {
      const stats = await fs.stat(mountPath);
      console.log(`   ✅ Mount point accessible: ${mountPath}`);
      console.log(`   📁 Is directory: ${stats.isDirectory()}`);
    } catch (error) {
      console.log(`   ❌ Mount point not accessible: ${error.message}`);
      console.log('   Please ensure /media/lucidlink-1 is mounted');
      return;
    }

    // Sample a subset for benchmarking
    console.log('\n2. Sampling filesystem for benchmark...');
    const sampleFiles = await sampleFilesystem(mountPath, 1000); // Sample 1000 files
    console.log(`   📊 Sampled ${sampleFiles.length} files for benchmark`);

    if (sampleFiles.length === 0) {
      console.log('   ⚠️  No files found to benchmark');
      return;
    }

    // Test different batch sizes
    const batchSizes = [100, 500, 1000, 5000, 10000];
    const results = [];

    console.log('\n3. Testing different Elasticsearch batch sizes...');
    
    for (const batchSize of batchSizes) {
      if (batchSize > sampleFiles.length) {
        console.log(`   ⏭️  Skipping batch size ${batchSize} (larger than sample)`);
        continue;
      }

      console.log(`\n   🧪 Testing batch size: ${batchSize}`);
      
      // Create fresh ES client for each test
      const esClient = new ElasticsearchClient({
        indexName: `benchmark-test-${batchSize}`
      });
      
      await esClient.testConnection();
      await esClient.ensureIndexExists();

      // Prepare test data
      const testFiles = sampleFiles.slice(0, batchSize);
      
      // Benchmark the indexing
      const startTime = process.hrtime.bigint();
      const result = await esClient.bulkIndexFiles(testFiles);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      const filesPerSecond = Math.round((result.indexed / durationMs) * 1000);
      
      const benchmarkResult = {
        batchSize,
        filesIndexed: result.indexed,
        errors: result.errors.length,
        durationMs: Math.round(durationMs),
        filesPerSecond,
        avgTimePerFile: Math.round(durationMs / result.indexed * 100) / 100
      };
      
      results.push(benchmarkResult);
      
      console.log(`      📈 Results:`);
      console.log(`         • Files indexed: ${benchmarkResult.filesIndexed}`);
      console.log(`         • Duration: ${benchmarkResult.durationMs}ms`);
      console.log(`         • Throughput: ${benchmarkResult.filesPerSecond} files/sec`);
      console.log(`         • Avg per file: ${benchmarkResult.avgTimePerFile}ms`);
      console.log(`         • Errors: ${benchmarkResult.errors}`);
      
      // Cleanup test index
      try {
        await esClient.client.indices.delete({ index: `benchmark-test-${batchSize}` });
      } catch (e) {}
    }

    // Test dual indexing overhead
    console.log('\n4. Testing dual indexing overhead...');
    
    // Create test samples for dual indexing
    const dualTestFiles = sampleFiles.slice(0, 500);
    
    // ES only timing
    console.log('   🔍 Elasticsearch only...');
    const esClient = new ElasticsearchClient({ indexName: 'benchmark-es-only' });
    await esClient.ensureIndexExists();
    
    const esOnlyStart = process.hrtime.bigint();
    await esClient.bulkIndexFiles(dualTestFiles);
    const esOnlyEnd = process.hrtime.bigint();
    const esOnlyDuration = Number(esOnlyEnd - esOnlyStart) / 1000000;
    
    // Cleanup
    try {
      await esClient.client.indices.delete({ index: 'benchmark-es-only' });
    } catch (e) {}
    
    // Dual indexing simulation (ES + mock PG)
    console.log('   ⚡ Dual indexing simulation...');
    const dualStart = process.hrtime.bigint();
    
    // Simulate both operations in parallel
    const promises = [
      esClient.bulkIndexFiles(dualTestFiles), // ES indexing
      new Promise(resolve => setTimeout(resolve, 100)) // Mock PG operation
    ];
    
    await Promise.all(promises);
    const dualEnd = process.hrtime.bigint();
    const dualDuration = Number(dualEnd - dualStart) / 1000000;
    
    console.log(`      📊 ES only: ${Math.round(esOnlyDuration)}ms`);
    console.log(`      📊 Dual indexing: ${Math.round(dualDuration)}ms`);
    console.log(`      📊 Overhead: ${Math.round(((dualDuration - esOnlyDuration) / esOnlyDuration) * 100)}%`);

    // Performance summary
    console.log('\n📋 Benchmark Results Summary:');
    console.log('=============================');
    
    console.log('\n🏆 Best Performance by Batch Size:');
    results.sort((a, b) => b.filesPerSecond - a.filesPerSecond);
    
    results.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
      console.log(`${medal} ${result.batchSize.toString().padStart(5)} files: ${result.filesPerSecond.toString().padStart(4)} files/sec (${result.durationMs}ms)`);
    });

    const optimal = results[0];
    console.log(`\n⚡ Optimal Configuration:`);
    console.log(`   • Batch size: ${optimal.batchSize} files`);
    console.log(`   • Throughput: ${optimal.filesPerSecond} files/sec`);
    console.log(`   • Average: ${optimal.avgTimePerFile}ms per file`);

    // Recommendations
    console.log('\n🎯 Recommendations:');
    console.log(`   • Use batch size: ${optimal.batchSize} for maximum throughput`);
    console.log(`   • Expected indexing time for 100K files: ${Math.round(100000 / optimal.filesPerSecond)}s`);
    console.log(`   • Dual indexing overhead: ~${Math.round(((dualDuration - esOnlyDuration) / esOnlyDuration) * 100)}% (acceptable)`);
    
    if (optimal.errors > 0) {
      console.log(`   ⚠️  Monitor error rate: ${optimal.errors}/${optimal.filesIndexed} files failed`);
    }

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

async function sampleFilesystem(rootPath, maxFiles) {
  const files = [];
  
  async function scanDirectory(dirPath, depth = 0) {
    if (files.length >= maxFiles || depth > 3) return;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          files.push({
            id: fullPath,
            path: fullPath,
            name: entry.name,
            parent_path: dirPath,
            is_directory: false,
            size: stats.size,
            modified_at: stats.mtime.toISOString(),
            cached: Math.random() > 0.5, // Random cache status
            extension: path.extname(entry.name).toLowerCase()
          });
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Sample some directories too
          if (files.length < maxFiles * 0.9) { // Keep 10% for directories
            files.push({
              id: fullPath,
              path: fullPath,
              name: entry.name,
              parent_path: dirPath,
              is_directory: true,
              size: 0,
              modified_at: new Date().toISOString(),
              cached: true
            });
          }
          
          // Recurse into subdirectory
          await scanDirectory(fullPath, depth + 1);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.log(`   ⚠️  Skipping ${dirPath}: ${error.message}`);
    }
  }
  
  await scanDirectory(rootPath);
  return files;
}

benchmarkESIndexing();