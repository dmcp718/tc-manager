// API client for file system operations
class FileSystemAPI {
  static baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  
  static getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  
  static async getFilespaces() {
    const response = await fetch(`${this.baseURL}/filespaces`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  static async getRoots() {
    const response = await fetch(`${this.baseURL}/roots`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }
  
  static async getFiles(path, filespaceId = null) {
    let url = `${this.baseURL}/files?path=${encodeURIComponent(path)}`;
    if (filespaceId) {
      url += `&filespace_id=${filespaceId}`;
    }
    
    const response = await fetch(url, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }
  
  static async executeScript(scriptPath, args = []) {
    const response = await fetch(`${this.baseURL}/execute`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ scriptPath, args }),
    });
    return response.json();
  }
  
  static async getJobs() {
    const response = await fetch(`${this.baseURL}/jobs`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
  
  static async getCacheStats() {
    const response = await fetch(`${this.baseURL}/cache-stats`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }
}

export default FileSystemAPI;