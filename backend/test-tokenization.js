#!/usr/bin/env node

const ElasticsearchClient = require('./elasticsearch-client');

async function testTokenization() {
  console.log('🔍 Testing Tokenization of Numbered Filenames...\n');
  
  try {
    const client = new ElasticsearchClient({
      host: 'localhost',
      port: 9200,
      indexName: 'sitecache-tokenization-test'
    });
    
    // Test connection
    const connected = await client.testConnection();
    if (!connected) {
      throw new Error('Connection failed');
    }
    
    // Create index
    await client.ensureIndexExists();
    console.log('✅ Index created with custom analyzers\n');
    
    // Test sample numbered filenames
    const sampleFiles = [
      {
        id: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        path: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        name: 'Farm00101_Proxy.mp4',
        parent_path: '/00_Media/Farm/Proxies',
        is_directory: false,
        size: 1048576,
        modified_at: new Date().toISOString(),
        permissions: '644',
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
        permissions: '644',
        cached: true
      },
      {
        id: '/00_Media/Farm/Proxies/Farm00103_Proxy.mp4',
        path: '/00_Media/Farm/Proxies/Farm00103_Proxy.mp4',
        name: 'Farm00103_Proxy.mp4',
        parent_path: '/00_Media/Farm/Proxies',
        is_directory: false,
        size: 1048576,
        modified_at: new Date().toISOString(),
        permissions: '644',
        cached: false
      }
    ];
    
    // Index files
    await client.bulkIndexFiles(sampleFiles);
    console.log('✅ Indexed numbered filename samples\n');
    
    // Wait for refresh
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test different search patterns
    console.log('📋 Testing Search Patterns:\n');
    
    // Test 1: Search for "Farm"
    console.log('1. Searching for "Farm"...');
    const result1 = await client.searchFiles('Farm');
    console.log(`   Found ${result1.hits.length} results`);
    result1.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 2: Search for "Proxy"
    console.log('\n2. Searching for "Proxy"...');
    const result2 = await client.searchFiles('Proxy');
    console.log(`   Found ${result2.hits.length} results`);
    result2.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 3: Search for "Farm AND Proxy"
    console.log('\n3. Searching for "Farm AND Proxy"...');
    const result3 = await client.searchFiles('Farm AND Proxy');
    console.log(`   Found ${result3.hits.length} results`);
    result3.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 4: Search for specific number
    console.log('\n4. Searching for "00101"...');
    const result4 = await client.searchFiles('00101');
    console.log(`   Found ${result4.hits.length} results`);
    result4.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 5: Search for partial number
    console.log('\n5. Searching for "101"...');
    const result5 = await client.searchFiles('101');
    console.log(`   Found ${result5.hits.length} results`);
    result5.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test 6: Wildcard search
    console.log('\n6. Searching for "Farm*Proxy"...');
    const result6 = await client.searchFiles('Farm*Proxy');
    console.log(`   Found ${result6.hits.length} results`);
    result6.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    // Test analyzer directly
    console.log('\n📊 Analyzer Token Analysis:\n');
    
    // Check what tokens are created
    const testStrings = ['Farm00101_Proxy.mp4', 'Farm00102_Proxy', '00_Media'];
    
    for (const str of testStrings) {
      console.log(`Analyzing: "${str}"`);
      // We'll check this via curl since the client doesn't expose analyze API
      console.log('   Run: curl "http://localhost:9200/sitecache-tokenization-test/_analyze?pretty" -H \'Content-Type: application/json\' -d \'{"field": "name", "text": "' + str + '"}\'');
    }
    
    // Cleanup
    await client.client.indices.delete({ index: 'sitecache-tokenization-test' });
    console.log('\n✅ Test complete, index cleaned up');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testTokenization();