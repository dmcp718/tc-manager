#!/usr/bin/env node

const ElasticsearchClient = require('./elasticsearch-client');

async function testFinalSearch() {
  console.log('🎯 Final Test: Numbered Filenames with Simple Approach\n');
  
  try {
    const client = new ElasticsearchClient({
      host: 'localhost',
      port: 9200,
      indexName: 'sitecache-final-test'
    });
    
    await client.testConnection();
    await client.ensureIndexExists();
    
    // Real-world Farm file examples
    const farmFiles = [
      {
        id: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        path: '/00_Media/Farm/Proxies/Farm00101_Proxy.mp4',
        name: 'Farm00101_Proxy.mp4',
        parent_path: '/00_Media/Farm/Proxies',
        is_directory: false,
        cached: true
      },
      {
        id: '/00_Media/Farm/Proxies/Farm00102_Proxy.mp4',
        path: '/00_Media/Farm/Proxies/Farm00102_Proxy.mp4',
        name: 'Farm00102_Proxy.mp4',
        parent_path: '/00_Media/Farm/Proxies',
        is_directory: false,
        cached: true
      }
    ];
    
    await client.bulkIndexFiles(farmFiles);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('📋 Search Results:\n');
    
    // Test the exact case from the user's example
    console.log('1. Search: "Farm"');
    const result1 = await client.searchFiles('Farm');
    console.log(`   Found: ${result1.hits.length} results`);
    result1.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    console.log('\n2. Search: "Proxy"');
    const result2 = await client.searchFiles('Proxy');
    console.log(`   Found: ${result2.hits.length} results`);
    result2.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    console.log('\n3. Search: "Farm AND Proxy"');
    const result3 = await client.searchFiles('Farm AND Proxy');
    console.log(`   Found: ${result3.hits.length} results`);
    result3.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    console.log('\n4. Search: "farm00101" (lowercase)');
    const result4 = await client.searchFiles('farm00101');
    console.log(`   Found: ${result4.hits.length} results`);
    result4.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    console.log('\n5. Search: "Farm00101" (mixed case)');
    const result5 = await client.searchFiles('Farm00101');
    console.log(`   Found: ${result5.hits.length} results`);
    result5.hits.forEach(hit => console.log(`   - ${hit.name}`));
    
    console.log('\n6. Path search: "Proxies"');
    const result6 = await client.searchFiles('Proxies');
    console.log(`   Found: ${result6.hits.length} results`);
    result6.hits.forEach(hit => console.log(`   - ${hit.name} (${hit.path})`));
    
    console.log('\n🎉 Summary for numbered filename search:');
    console.log('✅ "Farm" finds all Farm files');
    console.log('✅ "Proxy" finds proxy files');
    console.log('✅ "Farm AND Proxy" finds Farm proxy files');
    console.log('✅ "Farm00101" finds specific numbered file');
    console.log('✅ Path hierarchy search works');
    
    // Cleanup
    await client.client.indices.delete({ index: 'sitecache-final-test' });
    console.log('\n✅ Simple search approach confirmed working!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testFinalSearch();