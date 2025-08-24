#!/usr/bin/env node

const axios = require('axios');

const API_URL = 'http://localhost:8095/api/v1';
const API_KEY = process.env.API_GATEWAY_KEY || 'demo-api-key-2024';

async function testProgressSystem() {
  console.log('Testing Enhanced Progress System');
  console.log('================================\n');
  
  try {
    // Submit a small test job
    const jobRequest = {
      directories: ['/media/lucidlink-1/projects'],
      file_extensions: ['.mp4', '.mov'],
      max_files: 50,  // Small batch for testing
      description: 'Test progress tracking'
    };
    
    console.log('1. Submitting cache job...');
    const submitResponse = await axios.post(
      `${API_URL}/cache/jobs`,
      jobRequest,
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const jobId = submitResponse.data.job.id;
    console.log(`   Job created: ${jobId}\n`);
    
    // Poll for progress updates
    console.log('2. Monitoring progress (polling every 2 seconds)...\n');
    
    let lastStatus = '';
    let completedFiles = 0;
    let completedBytes = 0;
    
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get(
          `${API_URL}/cache/jobs/${jobId}`,
          {
            headers: { 'X-API-Key': API_KEY }
          }
        );
        
        const job = statusResponse.data.job;
        const progress = statusResponse.data.progress;
        
        // Check if progress changed
        if (job.completed_files !== completedFiles || job.completed_size_bytes !== completedBytes) {
          completedFiles = job.completed_files;
          completedBytes = job.completed_size_bytes;
          
          const completedGB = (completedBytes / 1e9).toFixed(3);
          const totalGB = (job.total_size_bytes / 1e9).toFixed(3);
          const percentFiles = ((job.completed_files / job.total_files) * 100).toFixed(1);
          const percentBytes = ((completedBytes / job.total_size_bytes) * 100).toFixed(1);
          
          console.log(`   Progress Update:`);
          console.log(`     - Files: ${job.completed_files}/${job.total_files} (${percentFiles}%)`);
          console.log(`     - Size: ${completedGB}/${totalGB} GB (${percentBytes}%)`);
          console.log(`     - Failed: ${job.failed_files}`);
          console.log(`     - Status: ${job.status}`);
          
          if (progress && progress.throughputMbps) {
            console.log(`     - Throughput: ${progress.throughputMbps.toFixed(1)} MB/s`);
          }
          
          console.log('');
        }
        
        // Check if job is complete
        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
          clearInterval(pollInterval);
          
          console.log('3. Job completed!');
          console.log(`   Final status: ${job.status}`);
          console.log(`   Total time: ${((Date.now() - new Date(job.created_at).getTime()) / 1000).toFixed(1)} seconds`);
          console.log(`   Files cached: ${job.completed_files}/${job.total_files}`);
          console.log(`   Data cached: ${(completedBytes / 1e9).toFixed(3)} GB`);
          
          if (job.failed_files > 0) {
            console.log(`   Failed files: ${job.failed_files}`);
          }
          
          process.exit(0);
        }
        
        lastStatus = job.status;
        
      } catch (error) {
        console.error('Error polling status:', error.message);
      }
    }, 2000);
    
    // Safety timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      console.log('\nTest timeout reached (5 minutes). Exiting...');
      process.exit(1);
    }, 300000);
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testProgressSystem();