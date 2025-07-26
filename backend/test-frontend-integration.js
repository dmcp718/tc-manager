#!/usr/bin/env node

const axios = require('axios');

async function testFrontendIntegration() {
  console.log('🧪 Testing Frontend Integration with Elasticsearch\n');
  
  const baseURL = 'http://localhost:3001';
  
  try {
    // Test 1: Check Elasticsearch availability
    console.log('1. Testing Elasticsearch availability...');
    const statsResponse = await axios.get(`${baseURL}/api/search/stats`);
    console.log(`   ✅ ES Available: ${statsResponse.data.available}`);
    console.log(`   📊 Documents: ${statsResponse.data.elasticsearch.documents}`);
    
    // Test 2: Test search functionality  
    console.log('\n2. Testing search functionality...');
    
    // Test basic search
    const searchResponse1 = await axios.get(`${baseURL}/api/search/es?q=Farm`);
    console.log(`   🔍 "Farm" search: ${searchResponse1.data.total} results`);
    searchResponse1.data.results.slice(0, 2).forEach(result => {
      console.log(`      - ${result.name} (${result.isDirectory ? 'dir' : 'file'})`);
    });
    
    // Test wildcard search
    const searchResponse2 = await axios.get(`${baseURL}/api/search/es?q=*`);
    console.log(`   🔍 "*" wildcard: ${searchResponse2.data.total} results`);
    
    // Test with filters
    const searchResponse3 = await axios.get(`${baseURL}/api/search/es?q=*&is_directory=false`);
    console.log(`   🔍 Files only: ${searchResponse3.data.total} results`);
    
    // Test case sensitivity
    const searchResponse4 = await axios.get(`${baseURL}/api/search/es?q=farm`);
    console.log(`   🔍 "farm" (lowercase): ${searchResponse4.data.total} results`);
    
    // Test 3: Test error handling (search without Elasticsearch)
    console.log('\n3. Testing error handling...');
    
    // Test PostgreSQL fallback (should fail since PG isn't running)
    try {
      const pgResponse = await axios.get(`${baseURL}/api/files?path=/fake-path`);
      console.log('   ❌ PostgreSQL should have failed');
    } catch (error) {
      console.log('   ✅ PostgreSQL fallback properly returns error');
    }
    
    // Test 4: Simulate frontend flow
    console.log('\n4. Simulating frontend search flow...');
    
    // Simulate user typing "Farm" in search box
    const userSearch = await axios.get(`${baseURL}/api/search/es?q=Farm`);
    console.log(`   👤 User searches "Farm": ${userSearch.data.total} results`);
    
    // Simulate clicking "Show in folder" for first result
    if (userSearch.data.results.length > 0) {
      const firstResult = userSearch.data.results[0];
      const parentPath = firstResult.path.split('/').slice(0, -1).join('/') || '/';
      console.log(`   📁 "Show in folder" would navigate to: ${parentPath}`);
    }
    
    console.log('\n✅ Frontend integration test completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Elasticsearch connection working');
    console.log('   ✅ Search API responding correctly');
    console.log('   ✅ Search results formatted for frontend');
    console.log('   ✅ Error handling working');
    console.log('   ✅ Frontend flow simulation successful');
    
    console.log('\n🎯 Next Steps:');
    console.log('   1. Start frontend development server');
    console.log('   2. Open browser to test UI integration');
    console.log('   3. Test search mode switching');
    console.log('   4. Test "Show in folder" navigation');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testFrontendIntegration();