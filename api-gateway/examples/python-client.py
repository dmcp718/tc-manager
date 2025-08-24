#!/usr/bin/env python3
"""
TeamCache Manager API Client
A comprehensive Python client for interacting with the TeamCache Manager API.
"""

import requests
import json
import time
import asyncio
import websockets
from typing import List, Dict, Optional, Any
from datetime import datetime


class TeamCacheClient:
    """Client for TeamCache Manager API"""
    
    def __init__(self, api_url: str = "http://localhost:8095", api_key: str = "demo-api-key-2024"):
        """
        Initialize the TeamCache client.
        
        Args:
            api_url: Base URL of the API server
            api_key: API key for authentication
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        })
    
    def health_check(self) -> Dict[str, Any]:
        """Check API server health status"""
        response = self.session.get(f"{self.api_url}/api/v1/health")
        response.raise_for_status()
        return response.json()
    
    def create_cache_job(self, 
                        files: Optional[List[str]] = None,
                        directories: Optional[List[str]] = None,
                        recursive: bool = True) -> Dict[str, Any]:
        """
        Create a new cache job.
        
        Args:
            files: List of file paths to cache
            directories: List of directory paths to cache
            recursive: Whether to scan directories recursively
            
        Returns:
            Job creation response with job ID and details
        """
        if not files and not directories:
            raise ValueError("Must provide either files or directories")
        
        data = {"recursive": recursive}
        if files:
            data["files"] = files
        if directories:
            data["directories"] = directories
        
        response = self.session.post(
            f"{self.api_url}/api/v1/cache/jobs",
            json=data
        )
        response.raise_for_status()
        return response.json()
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get status and progress of a specific job.
        
        Args:
            job_id: The job ID to query
            
        Returns:
            Job status and progress information
        """
        response = self.session.get(f"{self.api_url}/api/v1/cache/jobs/{job_id}")
        response.raise_for_status()
        return response.json()
    
    def list_jobs(self, 
                  page: int = 1, 
                  limit: int = 10,
                  status: Optional[str] = None) -> Dict[str, Any]:
        """
        List all cache jobs with pagination.
        
        Args:
            page: Page number (default: 1)
            limit: Items per page (default: 10)
            status: Filter by job status
            
        Returns:
            Paginated list of jobs
        """
        params = {"page": page, "limit": limit}
        if status:
            params["status"] = status
        
        response = self.session.get(
            f"{self.api_url}/api/v1/cache/jobs",
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """
        Cancel a running or pending job.
        
        Args:
            job_id: The job ID to cancel
            
        Returns:
            Cancellation confirmation
        """
        response = self.session.delete(f"{self.api_url}/api/v1/cache/jobs/{job_id}")
        response.raise_for_status()
        return response.json()
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current system metrics including LucidLink and S3 health"""
        response = requests.get(f"{self.api_url}/api/v1/metrics")
        response.raise_for_status()
        return response.json()
    
    def get_s3_metrics(self) -> Dict[str, Any]:
        """Get detailed S3 health metrics with history"""
        response = requests.get(f"{self.api_url}/api/v1/metrics/s3")
        response.raise_for_status()
        return response.json()
    
    def monitor_job(self, 
                   job_id: str, 
                   interval: int = 5,
                   callback: Optional[callable] = None) -> Dict[str, Any]:
        """
        Monitor a job until completion.
        
        Args:
            job_id: The job ID to monitor
            interval: Seconds between status checks
            callback: Optional callback function for progress updates
            
        Returns:
            Final job status
        """
        while True:
            status = self.get_job_status(job_id)
            job = status["job"]
            
            # Call callback if provided
            if callback:
                callback(job)
            else:
                # Default progress display
                progress = job["progress"]
                print(f"\rProgress: {progress['size']['completedReadable']} / "
                      f"{progress['size']['totalReadable']} "
                      f"({progress['size']['percentage']}%)", end="", flush=True)
            
            # Check if job is complete
            if job["status"] in ["completed", "failed", "cancelled"]:
                print()  # New line after progress
                return job
            
            time.sleep(interval)
    
    def batch_cache_directories(self, directories: List[str], monitor: bool = True) -> List[str]:
        """
        Submit multiple directories as separate cache jobs.
        
        Args:
            directories: List of directory paths to cache
            monitor: Whether to monitor jobs until completion
            
        Returns:
            List of job IDs
        """
        job_ids = []
        
        for directory in directories:
            try:
                print(f"Submitting job for: {directory}")
                result = self.create_cache_job(directories=[directory])
                job_id = result["jobId"]
                job_ids.append(job_id)
                print(f"  Created job: {job_id}")
                print(f"  Files: {result['totalFiles']}")
                print(f"  Size: {result['totalSize']['readable']}")
                
                if monitor:
                    print("  Monitoring progress...")
                    final_status = self.monitor_job(job_id)
                    print(f"  Final status: {final_status['status']}")
                
            except Exception as e:
                print(f"  Error: {e}")
        
        return job_ids


class MetricsMonitor:
    """WebSocket-based real-time metrics monitor"""
    
    def __init__(self, ws_url: str = "ws://localhost:8095/ws"):
        """
        Initialize the metrics monitor.
        
        Args:
            ws_url: WebSocket URL for real-time metrics
        """
        self.ws_url = ws_url
        self.metrics = {
            "lucidLink": None,
            "s3Health": None
        }
    
    async def connect_and_monitor(self, duration: Optional[int] = None):
        """
        Connect to WebSocket and monitor metrics.
        
        Args:
            duration: Optional duration in seconds to monitor (None = forever)
        """
        start_time = time.time()
        
        async with websockets.connect(self.ws_url) as websocket:
            print(f"Connected to metrics WebSocket: {self.ws_url}")
            
            while True:
                # Check duration
                if duration and (time.time() - start_time) > duration:
                    break
                
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    
                    # Handle different message types
                    if data.get("type") == "metrics":
                        # Initial full metrics
                        self.metrics["lucidLink"] = data.get("lucidLink")
                        self.metrics["s3Health"] = data.get("s3Health")
                        self._display_metrics("Initial metrics received")
                    
                    elif data.get("type") == "lucidlink-stats":
                        # LucidLink throughput update
                        self.metrics["lucidLink"] = data.get("lucidLink")
                        throughput = data["lucidLink"]["throughputMbps"]
                        print(f"LucidLink: {throughput:.2f} MB/s")
                    
                    elif data.get("type") == "s3-health":
                        # S3 health update
                        self.metrics["s3Health"] = data.get("s3Health")
                        health = data["s3Health"]
                        status = "✅" if health["isHealthy"] else "❌"
                        print(f"S3 Health: {status} Latency: {health['latency']}ms "
                              f"(avg: {health['averageLatency']}ms)")
                
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    print(f"Error: {e}")
    
    def _display_metrics(self, title: str):
        """Display current metrics"""
        print(f"\n{title}")
        print("-" * 50)
        
        if self.metrics["lucidLink"]:
            ll = self.metrics["lucidLink"]
            print(f"LucidLink Throughput: {ll.get('throughputMbps', 0):.2f} MB/s")
        
        if self.metrics["s3Health"]:
            s3 = self.metrics["s3Health"]
            status = "Healthy" if s3.get("isHealthy") else "Unhealthy"
            print(f"S3 Status: {status}")
            print(f"S3 Latency: {s3.get('latency', 'N/A')}ms")
            print(f"S3 Avg Latency: {s3.get('averageLatency', 'N/A')}ms")
        
        print("-" * 50)


def format_job_status(job: Dict[str, Any]) -> str:
    """Format job status for display"""
    progress = job["progress"]
    
    status_lines = [
        f"Job ID: {job['id']}",
        f"Status: {job['status']}",
        f"Files: {progress['files']['completed']}/{progress['files']['total']} "
        f"({progress['files']['percentage']}%)",
        f"Size: {progress['size']['completedReadable']}/{progress['size']['totalReadable']} "
        f"({progress['size']['percentage']}%)"
    ]
    
    if job.get("throughput"):
        status_lines.append(f"Speed: {job['throughput']['readable']}")
    
    return "\n".join(status_lines)


def main():
    """Example usage of the TeamCache client"""
    
    # Initialize client
    client = TeamCacheClient()
    
    # Check health
    print("Checking API health...")
    health = client.health_check()
    print(f"API Status: {health['status']}")
    print(f"Database: {health['database']}")
    print()
    
    # Get current metrics
    print("Current System Metrics:")
    metrics = client.get_metrics()
    if metrics["success"]:
        m = metrics["metrics"]
        print(f"  LucidLink: {m['lucidLink']['throughputMbps']:.2f} MB/s")
        print(f"  S3 Latency: {m['s3Health']['latency']}ms")
        print(f"  S3 Healthy: {m['s3Health']['isHealthy']}")
    print()
    
    # Example: Create a cache job
    print("Creating cache job...")
    job_result = client.create_cache_job(
        directories=["Projects/2024/Q1"],
        recursive=True
    )
    
    if job_result["success"]:
        job_id = job_result["jobId"]
        print(f"Job created: {job_id}")
        print(f"Total files: {job_result['totalFiles']}")
        print(f"Total size: {job_result['totalSize']['readable']}")
        print()
        
        # Monitor the job
        print("Monitoring job progress...")
        final_job = client.monitor_job(job_id)
        print(f"\nJob completed with status: {final_job['status']}")
    
    # List recent jobs
    print("\nRecent Jobs:")
    jobs_response = client.list_jobs(limit=5)
    for job in jobs_response["jobs"]:
        print(f"  - {job['id']}: {job['status']} "
              f"({job['completed_files']}/{job['total_files']} files)")


async def monitor_metrics_example():
    """Example of real-time metrics monitoring"""
    monitor = MetricsMonitor()
    
    print("Starting real-time metrics monitoring for 30 seconds...")
    await monitor.connect_and_monitor(duration=30)
    print("\nMonitoring complete!")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "monitor":
        # Run WebSocket monitoring
        asyncio.run(monitor_metrics_example())
    else:
        # Run standard examples
        main()