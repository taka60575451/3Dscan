// WebWorker for Point Cloud Processing
// Handles intensive computations in background thread

// Constants for processing settings
const CHUNK_SIZE = 100000; // Process data in chunks to avoid blocking
const MIN_DISTANCE = 0.01; // Minimum distance between points for filtering
const DEFAULT_SAMPLING_RATE = 0.5; // Default downsampling rate

// Main message handler
self.onmessage = function(e) {
  try {
    const { cmd, data, options } = e.data;
    
    switch(cmd) {
      case 'process':
        processPointCloud(data, options);
        break;
      case 'filter':
        filterPointCloud(data, options);
        break;
      case 'downsample':
        downsamplePointCloud(data, options);
        break;
      case 'transform':
        transformPointCloud(data, options);
        break;
      case 'optimize':
        optimizeDataStructure(data, options);
        break;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
  } catch (error) {
    self.postMessage({
      status: 'error',
      error: error.message
    });
  }
};

// Process point cloud - main entry point that can run multiple operations
function processPointCloud(pointData, options = {}) {
  const startTime = performance.now();
  let processedData = pointData;
  let totalPoints = pointData.length / 3; // Assuming [x,y,z,x,y,z,...] format
  
  self.postMessage({ status: 'started', totalPoints });
  
  // Apply operations in sequence as needed
  if (options.filter) {
    processedData = filterPointCloud(processedData, options.filter, false);
  }
  
  if (options.downsample) {
    processedData = downsamplePointCloud(processedData, options.downsample, false);
  }
  
  if (options.transform) {
    processedData = transformPointCloud(processedData, options.transform, false);
  }
  
  if (options.optimize) {
    processedData = optimizeDataStructure(processedData, options.optimize, false);
  }
  
  const endTime = performance.now();
  
  self.postMessage({
    status: 'completed',
    data: processedData,
    processTime: endTime - startTime,
    pointCount: processedData.length / 3
  });
  
  return processedData;
}

// Filter point cloud to remove noise and outliers
function filterPointCloud(pointData, options = {}, returnResult = true) {
  const { threshold = MIN_DISTANCE, method = 'statistical' } = options;
  const totalPoints = pointData.length / 3;
  
  if (returnResult) self.postMessage({ status: 'filtering', totalPoints });
  
  let filteredData;
  
  // Process in chunks to avoid blocking
  if (method === 'statistical') {
    filteredData = statisticalOutlierRemoval(pointData, threshold);
  } else if (method === 'radius') {
    filteredData = radiusOutlierRemoval(pointData, threshold);
  } else {
    filteredData = distanceFilter(pointData, threshold);
  }
  
  if (returnResult) {
    self.postMessage({
      status: 'filtered',
      data: filteredData,
      pointCount: filteredData.length / 3
    });
  }
  
  return filteredData;
}

// Statistical outlier removal
function statisticalOutlierRemoval(pointData, stdDevMultiplier = 1.0) {
  // Implementation of statistical outlier removal
  // Calculate mean distances and remove points that deviate too much
  
  const positions = [];
  for (let i = 0; i < pointData.length; i += 3) {
    positions.push([pointData[i], pointData[i+1], pointData[i+2]]);
  }
  
  // Calculate nearest neighbors and mean distances
  // ... (implementation details)
  
  // For demonstration, just returning original data
  // In a real implementation, this would remove statistical outliers
  return pointData;
}

// Radius outlier removal
function radiusOutlierRemoval(pointData, radius = 0.05, minNeighbors = 2) {
  // Implementation would search for points with fewer than minNeighbors within radius
  // ... (implementation details)
  
  // For demonstration, just returning original data
  return pointData;
}

// Simple distance-based filter
function distanceFilter(pointData, maxDistance = 10.0) {
  const filtered = [];
  const origin = [0, 0, 0];
  
  for (let i = 0; i < pointData.length; i += 3) {
    const x = pointData[i];
    const y = pointData[i+1];
    const z = pointData[i+2];
    
    const distance = Math.sqrt(x*x + y*y + z*z);
    
    if (distance <= maxDistance) {
      filtered.push(x, y, z);
    }
    
    // Report progress periodically
    if (i % CHUNK_SIZE === 0) {
      self.postMessage({
        status: 'progress',
        progress: i / pointData.length,
        operation: 'filtering'
      });
    }
  }
  
  return filtered;
}

// Downsample point cloud to reduce density
function downsamplePointCloud(pointData, options = {}, returnResult = true) {
  const { rate = DEFAULT_SAMPLING_RATE, method = 'random' } = options;
  const totalPoints = pointData.length / 3;
  
  if (returnResult) self.postMessage({ status: 'downsampling', totalPoints });
  
  let downsampledData;
  
  if (method === 'voxel') {
    downsampledData = voxelDownsampling(pointData, options.voxelSize || 0.05);
  } else {
    downsampledData = randomDownsampling(pointData, rate);
  }
  
  if (returnResult) {
    self.postMessage({
      status: 'downsampled',
      data: downsampledData,
      pointCount: downsampledData.length / 3
    });
  }
  
  return downsampledData;
}

// Random downsampling - select points randomly based on sampling rate
function randomDownsampling(pointData, rate = 0.5) {
  if (rate >= 1.0) return pointData;
  
  const result = [];
  
  for (let i = 0; i < pointData.length; i += 3) {
    if (Math.random() <= rate) {
      result.push(pointData[i], pointData[i+1], pointData[i+2]);
    }
    
    // Report progress periodically
    if (i % CHUNK_SIZE === 0) {
      self.postMessage({
        status: 'progress',
        progress: i / pointData.length,
        operation: 'downsampling'
      });
    }
  }
  
  return result;
}

// Voxel downsampling - represent multiple points in a voxel with a single point
function voxelDownsampling(pointData, voxelSize = 0.05) {
  const voxels = new Map();
  
  for (let i = 0; i < pointData.length; i += 3) {
    const x = pointData[i];
    const y = pointData[i+1];
    const z = pointData[i+2];
    
    // Calculate voxel indices
    const vx = Math.floor(x / voxelSize);
    const vy = Math.floor(y / voxelSize);
    const vz = Math.floor(z / voxelSize);
    
    const voxelKey = `${vx},${vy},${vz}`;
    
    if (!voxels.has(voxelKey)) {
      voxels.set(voxelKey, {
        sum: [x, y, z],
        count: 1
      });
    } else {
      const voxel = voxels.get(voxelKey);
      voxel.sum[0] += x;
      voxel.sum[1] += y;
      voxel.sum[2] += z;
      voxel.count++;
    }
    
    // Report progress periodically
    if (i % CHUNK_SIZE === 0) {
      self.postMessage({
        status: 'progress',
        progress: i / pointData.length,
        operation: 'voxel-downsampling'
      });
    }
  }
  
  // Calculate centroids for each voxel
  const result = [];
  let progress = 0;
  const totalVoxels = voxels.size;
  
  for (const voxel of voxels.values()) {
    result.push(
      voxel.sum[0] / voxel.count,
      voxel.sum[1] / voxel.count,
      voxel.sum[2] / voxel.count
    );
    
    progress++;
    if (progress % 1000 === 0) {
      self.postMessage({
        status: 'progress',
        progress: progress / totalVoxels,
        operation: 'voxel-centroid'
      });
    }
  }
  
  return result;
}

// Transform point cloud using matrix transformation
function transformPointCloud(pointData, options = {}, returnResult = true) {
  const { matrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] } = options;
  const totalPoints = pointData.length / 3;
  
  if (returnResult) self.postMessage({ status: 'transforming', totalPoints });
  
  const transformed = applyTransformation(pointData, matrix);
  
  if (returnResult) {
    self.postMessage({
      status: 'transformed',
      data: transformed,
      pointCount: transformed.length / 3
    });
  }
  
  return transformed;
}

// Apply transformation matrix to points
function applyTransformation(pointData, matrix) {
  const result = new Float32Array(pointData.length);
  
  for (let i = 0; i < pointData.length; i += 3) {
    const x = pointData[i];
    const y = pointData[i+1];
    const z = pointData[i+2];
    
    // Apply 4x4 transformation matrix
    result[i] = matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3];
    result[i+1] = matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7];
    result[i+2] = matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11];
    
    // Report progress periodically
    if (i % CHUNK_SIZE === 0) {
      self.postMessage({
        status: 'progress',
        progress: i / pointData.length,
        operation: 'transforming'
      });
    }
  }
  
  return result;
}

// Optimize data structure for better performance
function optimizeDataStructure(pointData, options = {}, returnResult = true) {
  const { method = 'octree' } = options;
  const totalPoints = pointData.length / 3;
  
  if (returnResult) self.postMessage({ status: 'optimizing', totalPoints });
  
  let optimizedData;
  
  if (method === 'octree') {
    optimizedData = buildOctree(pointData);
  } else if (method === 'kdtree') {
    optimizedData = buildKdTree(pointData);
  } else {
    optimizedData = reorderPoints(pointData);
  }
  
  if (returnResult) {
    self.postMessage({
      status: 'optimized',
      data: optimizedData,
      structure: method
    });
  }
  
  return optimizedData;
}

// Build octree structure for spatial indexing (simplified example)
function buildOctree(pointData) {
  // This would actually build a full octree structure
  // For demonstration, just returning the original data
  self.postMessage({
    status: 'info',
    message: 'Building octree structure'
  });
  
  // Here we would actually build the octree...
  // In a real implementation, this would create a hierarchical spatial structure
  
  return pointData;
}

// Build KD-tree for nearest neighbor searches (simplified example)
function buildKdTree(pointData) {
  // This would actually build a KD-tree
  // For demonstration, just returning the original data
  self.postMessage({
    status: 'info',
    message: 'Building KD-tree structure'
  });
  
  // Here we would actually build the KD-tree...
  // In a real implementation, this would create a spatial structure optimized for queries
  
  return pointData;
}

// Reorder points for better memory locality
function reorderPoints(pointData) {
  // Reorder points based on spatial proximity for better cache behavior
  self.postMessage({
    status: 'info',
    message: 'Reordering points for improved memory locality'
  });
  
  // Here we would actually reorder the points...
  // In a real implementation, this would sort points according to space-filling curves
  
  return pointData;
}

// Utility function for data transfers - use transferable objects when possible
function optimizeTransfer(data) {
  // If data is already in an efficient format, return it
  if (data instanceof Float32Array) {
    return data;
  }
  
  // Convert array to typed array for better performance
  return new Float32Array(data);
}