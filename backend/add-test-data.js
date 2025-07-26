#!/usr/bin/env node

const ElasticsearchClient = require('./elasticsearch-client');

async function addTestData() {
  console.log('Adding test data to production Elasticsearch index...\n');
  
  try {
    const client = new ElasticsearchClient({
      host: 'localhost',
      port: 9200,
      indexName: 'sitecache-files'
    });
    
    await client.testConnection();
    await client.ensureIndexExists();
    
    // Test data similar to real filesystem structure
    const testFiles = [
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
      },
      {
        id: '/00_Media/Test/Sample.jpg',
        path: '/00_Media/Test/Sample.jpg',
        name: 'Sample.jpg',
        parent_path: '/00_Media/Test',
        is_directory: false,
        size: 204800,
        modified_at: new Date().toISOString(),
        cached: true
      }
    ];
    
    const result = await client.bulkIndexFiles(testFiles);
    console.log(`✅ Added ${result.indexed} test files to index`);
    
    // Wait for refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test search
    console.log('\n📋 Testing search functionality:');
    
    const farmResults = await client.searchFiles('Farm');
    console.log(`"Farm" search: ${farmResults.hits.length} results`);
    
    const proxyResults = await client.searchFiles('proxy');
    console.log(`"proxy" search: ${proxyResults.hits.length} results`);
    
    const booleanResults = await client.searchFiles('Farm AND Proxy');
    console.log(`"Farm AND Proxy" search: ${booleanResults.hits.length} results`);
    
    console.log('\n✅ Test data added successfully!');
    
  } catch (error) {
    console.error('❌ Failed to add test data:', error.message);
    process.exit(1);
  }
}

addTestData();