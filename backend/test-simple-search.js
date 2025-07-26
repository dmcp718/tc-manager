#!/usr/bin/env node

const ElasticsearchClient = require('./elasticsearch-client');

async function testSimpleSearch() {
  console.log('🔍 Testing Simple Search Approach (fs-indexer-elasticsearch style)...\n');
  
  try {
    const client = new ElasticsearchClient({
      host: 'localhost',
      port: 9200,
      indexName: 'sitecache-simple-test'
    });
    
    // Test connection
    const connected = await client.testConnection();
    if (!connected) {
      throw new Error('Connection failed');
    }
    
    // Create index
    await client.ensureIndexExists();
    console.log('✅ Index created with simple analyzers\n');
    
    // Test sample files with Farm numbering system
    const sampleFiles = [
      {
        id: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        path: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        name: 'Farm00101_Proxy.mp4',
        parent_path: '/00_Media/Farm/Proxies',
        is_directory: false,
        size: 1048576,
        modified_at: new Date().toISOString(),
        cached: true
      },
      {
        id: '/00_Media/Farm/Proxies/Farm00102_Proxy.mp4',
        path: '/00_Media/Farm/Proxies/Farm00102_Proxy.mp4',
        name: 'Farm00102_Proxy.mp4',
        parent_path: '/00_Media/Farm/Proxies',
        is_directory: false,
        size: 1048576,
        modified_at: new Date().toISOString(),
        cached: true
      },
      {
        id: '/00_Media/Farm/Originals/Farm00101_Original.mov',
        path: '/00_Media/Farm/Originals/Farm00101_Original.mov',
        name: 'Farm00101_Original.mov',
        parent_path: '/00_Media/Farm/Originals',
        is_directory: false,
        size: 50000000,
        modified_at: new Date().toISOString(),
        cached: false
      },
      {
        id: '/00_Media/Farm/Proxies',
        path: '/00_Media/Farm/Proxies',
        name: 'Proxies',
        parent_path: '/00_Media/Farm',
        is_directory: true,
        size: 0,
        modified_at: new Date().toISOString(),
        cached: true
      }
    ];
    
    // Index files
    await client.bulkIndexFiles(sampleFiles);
    console.log('✅ Indexed Farm filename samples\n');
    
    // Wait for refresh
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test realistic search patterns
    console.log('📋 Testing Realistic Search Patterns:\n');
    
    // Test 1: Search for "Farm" (should find all Farm files)
    console.log('1. Search: "Farm"');
    const result1 = await client.searchFiles('Farm');
    console.log(`   Results: ${result1.hits.length}`);
    result1.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 2: Search for "Proxy" (should find proxy files)
    console.log('\n2. Search: "Proxy"');
    const result2 = await client.searchFiles('Proxy');
    console.log(`   Results: ${result2.hits.length}`);
    result2.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 3: Boolean search "Farm AND Proxy"
    console.log('\n3. Search: "Farm AND Proxy"');
    const result3 = await client.searchFiles('Farm AND Proxy');
    console.log(`   Results: ${result3.hits.length}`);
    result3.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 4: Wildcard search "Farm*" (prefix matching)
    console.log('\n4. Search: "Farm*"');
    const result4 = await client.searchFiles('Farm*');
    console.log(`   Results: ${result4.hits.length}`);
    result4.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 5: Path hierarchy search
    console.log('\n5. Search: "Proxies"');
    const result5 = await client.searchFiles('Proxies');
    console.log(`   Results: ${result5.hits.length}`);
    result5.hits.forEach(hit => console.log(`   - ${hit.name} (${hit.path})`));
    
    // Test 6: Extension-based search
    console.log('\n6. Search: "mp4"');
    const result6 = await client.searchFiles('mp4');
    console.log(`   Results: ${result6.hits.length}`);
    result6.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 7: Filtered search (cached proxy files)
    console.log('\n7. Filtered Search: cached proxy files');
    const result7 = await client.searchFiles('Proxy', {
      filters: { cached: true }
    });
    console.log(`   Results: ${result7.hits.length}`);
    result7.hits.forEach(hit => console.log(`   - ${hit.name} (cached: ${hit.cached})`));
    
    console.log('\n💡 For numbered sequences like "Farm00101", users can search:');
    console.log('   - "Farm" (finds all Farm files)');
    console.log('   - "Farm*" (prefix search)');
    console.log('   - "Farm AND Proxy" (boolean search)');
    console.log('   - Use filters for specific criteria');
    
    // Cleanup
    await client.client.indices.delete({ index: 'sitecache-simple-test' });
    console.log('\n✅ Test complete - Simple search approach works well!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testSimpleSearch();