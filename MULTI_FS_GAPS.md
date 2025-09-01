# Multi-Filespace Implementation Gaps

## Critical Issues to Address

### 1. Frontend File Tree Sidebar
**Current State:** Single root, no multi-fs awareness
**Required Updates:**
```javascript
// BrowserView.js - loadRoots() needs modification
const loadRoots = async () => {
  // Should return array of filespace roots:
  // [
  //   { id: 1, name: 'tc-east-1', path: '/media/lucidlink-1', filespace_id: 1 },
  //   { id: 2, name: 'tc-west-1', path: '/media/lucidlink-2', filespace_id: 2 }
  // ]
  const filespaces = await FileSystemAPI.getFilespaces();
  const treeNodes = filespaces.map(fs => ({
    id: `fs-${fs.id}`,
    parent: 0,
    text: fs.name,
    droppable: true,
    data: {
      path: fs.path,
      isDirectory: true,
      filespace_id: fs.id,
      isFilespaceRoot: true
    }
  }));
};
```

### 2. Index Files Functionality
**Current State:** Indexes single hardcoded path
**Required Updates:**
```javascript
// Add filespace selection dialog
const startIndexing = async (filespaceIds = []) => {
  if (filespaceIds.length === 0) {
    // Show dialog to select which filespace(s) to index
    const selected = await showFilespaceSelector();
    filespaceIds = selected;
  }
  
  // Start indexing for each selected filespace
  for (const fsId of filespaceIds) {
    await fetch('/api/index/start', {
      method: 'POST',
      body: JSON.stringify({ 
        filespace_id: fsId,
        path: getFilespaceMount(fsId)
      })
    });
  }
};
```

### 3. Elasticsearch Multi-Index Strategy
**Current State:** Single index without filespace differentiation
**Options:**

#### Option A: Single Index with Filespace Field
```json
{
  "mappings": {
    "properties": {
      "path": { "type": "keyword" },
      "name": { "type": "text" },
      "filespace_id": { "type": "integer" },
      "filespace_name": { "type": "keyword" },
      "mount_point": { "type": "keyword" }
    }
  }
}
```

#### Option B: Separate Indices per Filespace
```bash
# Create separate indices
teamcache-files-fs1
teamcache-files-fs2

# Use alias for cross-filespace search
teamcache-files-all -> [teamcache-files-fs1, teamcache-files-fs2]
```

### 4. API Endpoints Updates Needed

#### /api/roots → /api/filespaces
```javascript
app.get('/api/filespaces', async (req, res) => {
  const filespaces = [];
  for (let i = 1; i <= 5; i++) {
    const fs = process.env[`LUCIDLINK_FILESPACE_${i}`];
    const mount = process.env[`LUCIDLINK_MOUNT_POINT_${i}`];
    if (fs && mount) {
      filespaces.push({
        id: i,
        name: fs,
        mount_point: mount,
        instance_id: process.env[`LUCIDLINK_INSTANCE_${i}`]
      });
    }
  }
  res.json(filespaces);
});
```

#### Update all file operations to include filespace_id
```javascript
app.get('/api/files/:filespace_id/*', async (req, res) => {
  const { filespace_id } = req.params;
  const path = req.params[0];
  // Use filespace_id to determine correct mount point
});
```

### 5. Frontend Components Needing Updates

#### Add Filespace Selector Component
```javascript
const FilespaceSelector = ({ currentFilespace, onFilespaceChange }) => {
  return (
    <div className="filespace-selector">
      <select value={currentFilespace} onChange={e => onFilespaceChange(e.target.value)}>
        <option value="all">All Filespaces</option>
        <option value="1">tc-east-1</option>
        <option value="2">tc-west-1</option>
      </select>
    </div>
  );
};
```

#### Update BrowserView State
```javascript
const [currentFilespace, setCurrentFilespace] = useState(1);
const [filespaces, setFilespaces] = useState([]);

// All API calls need filespace context
const loadDirectory = async (path, filespaceId = currentFilespace) => {
  const response = await FileSystemAPI.getDirectory(path, filespaceId);
  // ...
};
```

### 6. Search Functionality Updates

#### Update Search API
```javascript
app.get('/api/search', async (req, res) => {
  const { q, filespace_id, search_all } = req.query;
  
  if (search_all) {
    // Search across all filespaces
    const results = await FileModel.searchAllFilespaces(q);
  } else {
    // Search specific filespace
    const results = await FileModel.searchFilespace(q, filespace_id);
  }
});
```

### 7. WebSocket Updates for Multi-FS

#### Broadcast with Filespace Context
```javascript
broadcast({
  type: 'file-indexed',
  filespace_id: 1,
  path: '/media/lucidlink-1/folder',
  stats: { ... }
});
```

### 8. Cache Jobs with Filespace Tracking

#### Update Cache Job Creation
```javascript
const createCacheJob = async (paths, filespaceId) => {
  // Determine filespace from paths
  const mountPoint = process.env[`LUCIDLINK_MOUNT_POINT_${filespaceId}`];
  
  const job = await CacheJobModel.create({
    file_paths: paths,
    filespace_id: filespaceId,
    mount_point: mountPoint,
    // ...
  });
};
```

## Implementation Priority

1. **Backend API** - Add filespace endpoints and update existing ones
2. **Database** - Run migration, update models
3. **Frontend State** - Add filespace context management
4. **Tree Sidebar** - Show multiple roots
5. **Index Button** - Support multi-fs indexing
6. **Search** - Update ES mapping and queries
7. **Cache Workers** - Add filespace tracking
8. **Stats Display** - Show active filespace indicator

## Testing Scenarios

1. **Tree Navigation**
   - Switch between filespaces
   - Lazy load directories from different filespaces
   - Drag & drop between filespaces (should fail)

2. **Indexing**
   - Index single filespace
   - Index multiple filespaces simultaneously
   - Resume interrupted indexing per filespace

3. **Search**
   - Search within single filespace
   - Search across all filespaces
   - Filter results by filespace

4. **Cache Jobs**
   - Create job with files from single filespace
   - Verify jobs don't mix filespaces
   - Stats switch based on active job's filespace

5. **Performance**
   - Verify lazy loading doesn't query wrong filespace
   - Check index performance with multiple filespaces
   - Monitor memory usage with dual filesystem trees