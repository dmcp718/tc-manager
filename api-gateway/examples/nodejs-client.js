#!/usr/bin/env node
/**
 * TeamCache Manager API Client for Node.js
 * A comprehensive client library with WebSocket support
 */

const axios = require('axios');
const WebSocket = require('ws');
const EventEmitter = require('events');

class TeamCacheClient {
    constructor(apiUrl = 'http://localhost:8095', apiKey = 'demo-api-key-2024') {
        this.apiUrl = apiUrl.replace(/\/$/, '');
        this.apiKey = apiKey;
        
        // Configure axios instance
        this.client = axios.create({
            baseURL: `${this.apiUrl}/api/v1`,
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Check API health status
     */
    async healthCheck() {
        const response = await this.client.get('/health');
        return response.data;
    }

    /**
     * Create a new cache job
     * @param {Array} files - List of file paths
     * @param {Array} directories - List of directory paths
     * @param {boolean} recursive - Scan directories recursively
     */
    async createCacheJob(files = [], directories = [], recursive = true) {
        if (!files.length && !directories.length) {
            throw new Error('Must provide either files or directories');
        }

        const data = { recursive };
        if (files.length) data.files = files;
        if (directories.length) data.directories = directories;

        const response = await this.client.post('/cache/jobs', data);
        return response.data;
    }

    /**
     * Get job status and progress
     * @param {string} jobId - Job ID to query
     */
    async getJobStatus(jobId) {
        const response = await this.client.get(`/cache/jobs/${jobId}`);
        return response.data;
    }

    /**
     * List all jobs with pagination
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @param {string} status - Filter by status
     */
    async listJobs(page = 1, limit = 10, status = null) {
        const params = { page, limit };
        if (status) params.status = status;

        const response = await this.client.get('/cache/jobs', { params });
        return response.data;
    }

    /**
     * Cancel a job
     * @param {string} jobId - Job ID to cancel
     */
    async cancelJob(jobId) {
        const response = await this.client.delete(`/cache/jobs/${jobId}`);
        return response.data;
    }

    /**
     * Get system metrics
     */
    async getMetrics() {
        const response = await axios.get(`${this.apiUrl}/api/v1/metrics`);
        return response.data;
    }

    /**
     * Get S3 health metrics
     */
    async getS3Metrics() {
        const response = await axios.get(`${this.apiUrl}/api/v1/metrics/s3`);
        return response.data;
    }

    /**
     * Monitor a job until completion
     * @param {string} jobId - Job ID to monitor
     * @param {number} interval - Check interval in milliseconds
     * @param {function} onProgress - Progress callback
     */
    async monitorJob(jobId, interval = 5000, onProgress = null) {
        return new Promise((resolve, reject) => {
            const checkStatus = async () => {
                try {
                    const result = await this.getJobStatus(jobId);
                    const job = result.job;

                    // Call progress callback if provided
                    if (onProgress) {
                        onProgress(job);
                    } else {
                        // Default progress display
                        const progress = job.progress;
                        process.stdout.write(
                            `\rProgress: ${progress.size.completedReadable}/${progress.size.totalReadable} ` +
                            `(${progress.size.percentage}%)`
                        );
                    }

                    // Check if job is complete
                    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
                        console.log(); // New line
                        resolve(job);
                    } else {
                        setTimeout(checkStatus, interval);
                    }
                } catch (error) {
                    reject(error);
                }
            };

            checkStatus();
        });
    }

    /**
     * Submit multiple directories as batch jobs
     * @param {Array} directories - List of directories
     * @param {boolean} monitor - Monitor until completion
     */
    async batchCacheDirectories(directories, monitor = true) {
        const jobIds = [];

        for (const directory of directories) {
            try {
                console.log(`Submitting job for: ${directory}`);
                const result = await this.createCacheJob([], [directory], true);
                
                const jobId = result.jobId;
                jobIds.push(jobId);
                
                console.log(`  Created job: ${jobId}`);
                console.log(`  Files: ${result.totalFiles}`);
                console.log(`  Size: ${result.totalSize.readable}`);

                if (monitor) {
                    console.log('  Monitoring progress...');
                    const finalJob = await this.monitorJob(jobId);
                    console.log(`  Final status: ${finalJob.status}`);
                }
            } catch (error) {
                console.error(`  Error: ${error.message}`);
            }
        }

        return jobIds;
    }
}

class MetricsMonitor extends EventEmitter {
    constructor(wsUrl = 'ws://localhost:8095/ws') {
        super();
        this.wsUrl = wsUrl;
        this.ws = null;
        this.metrics = {
            lucidLink: null,
            s3Health: null
        };
        this.reconnectInterval = 5000;
        this.reconnectTimer = null;
    }

    /**
     * Connect to WebSocket and start monitoring
     */
    connect() {
        console.log(`Connecting to metrics WebSocket: ${this.wsUrl}`);
        
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log('Connected to metrics WebSocket');
            this.emit('connected');
            
            // Clear reconnect timer if exists
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                
                switch (message.type) {
                    case 'metrics':
                        // Initial full metrics
                        this.metrics.lucidLink = message.lucidLink;
                        this.metrics.s3Health = message.s3Health;
                        this.emit('metrics', this.metrics);
                        console.log('Initial metrics received');
                        break;

                    case 'lucidlink-stats':
                        // LucidLink throughput update
                        this.metrics.lucidLink = message.lucidLink;
                        this.emit('lucidlink', message.lucidLink);
                        console.log(`LucidLink: ${message.lucidLink.throughputMbps.toFixed(2)} MB/s`);
                        break;

                    case 's3-health':
                        // S3 health update
                        this.metrics.s3Health = message.s3Health;
                        this.emit('s3health', message.s3Health);
                        const status = message.s3Health.isHealthy ? '✅' : '❌';
                        console.log(
                            `S3 Health: ${status} Latency: ${message.s3Health.latency}ms ` +
                            `(avg: ${message.s3Health.averageLatency}ms)`
                        );
                        break;
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('Disconnected from metrics WebSocket');
            this.emit('disconnected');
            this.reconnect();
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error.message);
            this.emit('error', error);
        });
    }

    /**
     * Reconnect to WebSocket after disconnect
     */
    reconnect() {
        if (!this.reconnectTimer) {
            console.log(`Reconnecting in ${this.reconnectInterval / 1000} seconds...`);
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, this.reconnectInterval);
        }
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return this.metrics;
    }
}

// Helper function to format job status
function formatJobStatus(job) {
    const progress = job.progress;
    const lines = [
        `Job ID: ${job.id}`,
        `Status: ${job.status}`,
        `Files: ${progress.files.completed}/${progress.files.total} (${progress.files.percentage}%)`,
        `Size: ${progress.size.completedReadable}/${progress.size.totalReadable} (${progress.size.percentage}%)`
    ];

    if (job.throughput) {
        lines.push(`Speed: ${job.throughput.readable}`);
    }

    return lines.join('\n');
}

// Example usage
async function main() {
    const client = new TeamCacheClient();

    try {
        // Check health
        console.log('Checking API health...');
        const health = await client.healthCheck();
        console.log(`API Status: ${health.status}`);
        console.log(`Database: ${health.database}`);
        console.log();

        // Get metrics
        console.log('Current System Metrics:');
        const metrics = await client.getMetrics();
        if (metrics.success) {
            const m = metrics.metrics;
            console.log(`  LucidLink: ${m.lucidLink.throughputMbps.toFixed(2)} MB/s`);
            console.log(`  S3 Latency: ${m.s3Health.latency}ms`);
            console.log(`  S3 Healthy: ${m.s3Health.isHealthy}`);
        }
        console.log();

        // Create a cache job
        console.log('Creating cache job...');
        const jobResult = await client.createCacheJob(
            [],
            ['Projects/2024/Q1'],
            true
        );

        if (jobResult.success) {
            const jobId = jobResult.jobId;
            console.log(`Job created: ${jobId}`);
            console.log(`Total files: ${jobResult.totalFiles}`);
            console.log(`Total size: ${jobResult.totalSize.readable}`);
            console.log();

            // Monitor the job
            console.log('Monitoring job progress...');
            const finalJob = await client.monitorJob(jobId);
            console.log(`\nJob completed with status: ${finalJob.status}`);
        }

        // List recent jobs
        console.log('\nRecent Jobs:');
        const jobsResponse = await client.listJobs(1, 5);
        for (const job of jobsResponse.jobs) {
            console.log(
                `  - ${job.id}: ${job.status} ` +
                `(${job.completed_files}/${job.total_files} files)`
            );
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Real-time monitoring example
function monitorMetrics(duration = 30000) {
    console.log(`Starting real-time metrics monitoring for ${duration / 1000} seconds...`);
    
    const monitor = new MetricsMonitor();
    
    // Set up event listeners
    monitor.on('connected', () => {
        console.log('Monitor connected successfully');
    });

    monitor.on('metrics', (metrics) => {
        console.log('Full metrics update received');
    });

    monitor.on('error', (error) => {
        console.error('Monitor error:', error.message);
    });

    // Connect
    monitor.connect();

    // Stop after duration
    setTimeout(() => {
        console.log('\nStopping monitor...');
        monitor.disconnect();
        process.exit(0);
    }, duration);
}

// Command line interface
if (require.main === module) {
    const command = process.argv[2];

    switch (command) {
        case 'monitor':
            monitorMetrics();
            break;
        case 'help':
            console.log('Usage:');
            console.log('  node nodejs-client.js         - Run examples');
            console.log('  node nodejs-client.js monitor - Monitor real-time metrics');
            console.log('  node nodejs-client.js help    - Show this help');
            break;
        default:
            main().catch(console.error);
    }
}

// Export for use as module
module.exports = {
    TeamCacheClient,
    MetricsMonitor,
    formatJobStatus
};