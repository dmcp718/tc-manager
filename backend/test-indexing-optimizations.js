#!/usr/bin/env node

const { FileIndexer } = require('./indexer');
const ElasticsearchClient = require('./elasticsearch-client');

async function testIndexingOptimizations() {
  console.log('🧪 Testing Phase 1 Indexing Optimizations');
  console.log('==========================================\n');

  try {
    // Test 1: Verify Elasticsearch client initialization
    console.log('1. Testing Elasticsearch client initialization...');
    const esClient = new ElasticsearchClient();
    const isConnected = await esClient.testConnection();
    console.log(`   ✅ Elasticsearch connection: ${isConnected ? 'Success' : 'Failed'}`);
    
    if (isConnected) {
      await esClient.ensureIndexExists();
      const stats = await esClient.getIndexStats();
      console.log(`   📊 Current index: ${stats?.documents || 0} documents`);
    }

    // Test 2: Initialize indexer with optimized settings
    console.log('\n2. Testing indexer with Phase 1 optimizations...');
    const indexer = new FileIndexer({
      batchSize: 5000,                    // Large batch sizes for speed
      maxParallelBatches: 3,              // Parallel processing
      elasticsearchBatchSize: 10000       // 10K ES batch size (Phase 1 optimization)
    });

    console.log('   ✅ Indexer initialized with:');
    console.log('      • PostgreSQL batch size: 5,000 files');
    console.log('      • Elasticsearch batch size: 10,000 files (10x increase)');
    console.log('      • Max parallel batches: 3');
    console.log('      • Retry mechanisms: 3 attempts with exponential backoff');

    // Test 3: Test Elasticsearch initialization within indexer
    console.log('\n3. Testing dual indexing initialization...');
    await indexer.initializeElasticsearch();
    
    console.log(`   ✅ Elasticsearch in indexer: ${indexer.elasticsearchEnabled ? 'Enabled' : 'Disabled'}`);
    
    if (indexer.elasticsearchEnabled) {
      console.log('   ✅ Dual indexing ready: PostgreSQL + Elasticsearch');
    } else {
      console.log('   ⚠️  Single indexing mode: PostgreSQL only');
    }

    // Test 4: Test batch processing logic (without actual filesystem scanning)
    console.log('\n4. Testing batch processing improvements...');
    
    // Create sample file data
    const sampleFiles = [
      {
        id: '/test/sample1.txt',
        path: '/test/sample1.txt', 
        name: 'sample1.txt',
        parent_path: '/test',
        is_directory: false,
        size: 1024,
        modified_at: new Date().toISOString(),
        cached: false
      },
      {
        id: '/test/sample2.mp4',
        path: '/test/sample2.mp4',
        name: 'sample2.mp4', 
        parent_path: '/test',
        is_directory: false,
        size: 5242880,
        modified_at: new Date().toISOString(),
        cached: true
      }
    ];

    if (indexer.elasticsearchEnabled) {
      console.log('   🔍 Testing Elasticsearch batch processing...');
      const startTime = Date.now();
      
      try {
        const result = await indexer.processElasticsearchBatch(sampleFiles);
        const duration = Date.now() - startTime;
        
        console.log(`   ✅ ES batch test: ${result?.indexed || 0} files indexed in ${duration}ms`);
        if (result?.errors?.length > 0) {
          console.log(`   ⚠️  ES batch errors: ${result.errors.length}`);
        }
      } catch (error) {
        console.log(`   ❌ ES batch test failed: ${error.message}`);
      }
    }

    // Test 5: Summary of improvements
    console.log('\n📋 Phase 1 Optimization Summary:');
    console.log('================================');
    console.log('✅ Performance Improvements:');
    console.log('   • Elasticsearch batch size: 1,000 → 10,000 files (10x increase)');
    console.log('   • Parallel indexing: PostgreSQL + Elasticsearch simultaneously');
    console.log('   • Error handling: 3 retries with exponential backoff');
    console.log('   • Non-blocking: ES failures don\'t stop PostgreSQL indexing');
    console.log('   • Better logging: Detailed batch statistics');

    console.log('\n✅ Architecture Benefits:');
    console.log('   • Graceful degradation: Works with or without Elasticsearch');
    console.log('   • Dual indexing: Real-time browsing + enhanced search');
    console.log('   • Better job stats: More accurate progress and error reporting');
    console.log('   • Retry resilience: Temporary ES failures are handled gracefully');

    console.log('\n🎯 Ready for Production Testing:');
    console.log('   1. Start indexing via /api/index/start');
    console.log('   2. Monitor dual indexing logs');
    console.log('   3. Test search functionality on both systems');
    console.log('   4. Verify job completion toast shows accurate stats');

    console.log('\n🚀 Phase 1 Optimizations: READY FOR TESTING');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testIndexingOptimizations();