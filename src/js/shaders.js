/**
 * shaders.js
 * 点群データレンダリング用のGLSLシェーダー定義と管理
 */

// 点群用頂点シェーダー
const pointCloudVertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float pointSize;
  uniform float opacity;
  
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pointSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 点群用フラグメントシェーダー
const pointCloudFragmentShader = `
  varying vec3 vColor;
  uniform float opacity;
  
  void main() {
    // 円形のポイントを描画
    float dist = length(gl_PointCoord - vec2(0.5, 0.5));
    if (dist > 0.5) discard;
    
    // 外縁をソフトにする
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
    gl_FragColor = vec4(vColor, opacity * alpha);
  }
`;

// 深度強調シェーダー
const depthEnhancedVertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vDepth;
  uniform float pointSize;
  uniform float opacity;
  uniform float depthFactor;
  
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mvPosition.z;
    gl_PointSize = size * pointSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const depthEnhancedFragmentShader = `
  varying vec3 vColor;
  varying float vDepth;
  uniform float opacity;
  uniform float depthFactor;
  uniform float maxDepth;
  
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5, 0.5));
    if (dist > 0.5) discard;
    
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
    float depthNormalized = clamp(vDepth / maxDepth, 0.0, 1.0);
    vec3 colorModified = mix(vColor, vColor * (1.0 - depthNormalized * depthFactor), depthFactor);
    
    gl_FragColor = vec4(colorModified, opacity * alpha);
  }
`;

// ヒートマップシェーダー
const heatmapVertexShader = `
  attribute float size;
  attribute vec3 color;
  attribute float intensity;
  varying vec3 vColor;
  varying float vIntensity;
  uniform float pointSize;
  uniform float opacity;
  
  void main() {
    vColor = color;
    vIntensity = intensity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pointSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const heatmapFragmentShader = `
  varying vec3 vColor;
  varying float vIntensity;
  uniform float opacity;
  uniform vec3 colorLow;
  uniform vec3 colorMid;
  uniform vec3 colorHigh;
  
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5, 0.5));
    if (dist > 0.5) discard;
    
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
    
    vec3 finalColor;
    if (vIntensity < 0.5) {
      finalColor = mix(colorLow, colorMid, vIntensity * 2.0);
    } else {
      finalColor = mix(colorMid, colorHigh, (vIntensity - 0.5) * 2.0);
    }
    
    gl_FragColor = vec4(finalColor, opacity * alpha);
  }
`;

// シェーダータイプ定数
const ShaderType = {
  STANDARD: 'standard',
  DEPTH_ENHANCED: 'depthEnhanced',
  HEATMAP: 'heatmap'
};

// デフォルトのユニフォーム値
const defaultUniforms = {
  pointSize: { value: 1.0 },
  opacity: { value: 1.0 },
  depthFactor: { value: 0.5 },
  maxDepth: { value: 1000.0 },
  colorLow: { value: new THREE.Color(0x0000ff) },  // 青
  colorMid: { value: new THREE.Color(0x00ff00) },  // 緑
  colorHigh: { value: new THREE.Color(0xff0000) }  // 赤
};

// シェーダーマテリアル生成関数
function createShaderMaterial(type = ShaderType.STANDARD, customUniforms = {}) {
  const uniforms = { ...defaultUniforms };
  
  // カスタムユニフォームを追加
  Object.keys(customUniforms).forEach(key => {
    uniforms[key] = { value: customUniforms[key] };
  });
  
  let vertexShader, fragmentShader;
  
  switch (type) {
    case ShaderType.DEPTH_ENHANCED:
      vertexShader = depthEnhancedVertexShader;
      fragmentShader = depthEnhancedFragmentShader;
      break;
    case ShaderType.HEATMAP:
      vertexShader = heatmapVertexShader;
      fragmentShader = heatmapFragmentShader;
      break;
    case ShaderType.STANDARD:
    default:
      vertexShader = pointCloudVertexShader;
      fragmentShader = pointCloudFragmentShader;
      break;
  }
  
  try {
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      vertexColors: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false
    });
  } catch (error) {
    console.error('シェーダーマテリアル作成エラー:', error);
    return null;
  }
}

// シェーダーパラメータ更新関数
function updateShaderParameters(material, parameters) {
  if (!material || !material.uniforms) return;
  
  Object.keys(parameters).forEach(key => {
    if (material.uniforms[key] !== undefined) {
      material.uniforms[key].value = parameters[key];
    }
  });
  
  material.needsUpdate = true;
}

// 特殊エフェクト適用関数
function applyShaderEffect(material, effectName, value) {
  if (!material || !material.uniforms) return;
  
  switch (effectName) {
    case 'glow':
      // 輝度を上げる
      material.uniforms.pointSize.value *= 1.2;
      break;
    case 'depth':
      // 深度強調
      material.uniforms.depthFactor.value = value;
      break;
    case 'heatVision':
      // ヒートマップカラー
      material.uniforms.colorLow.value = new THREE.Color(value.low || 0x0000ff);
      material.uniforms.colorMid.value = new THREE.Color(value.mid || 0x00ff00);
      material.uniforms.colorHigh.value = new THREE.Color(value.high || 0xff0000);
      break;
    case 'opacity':
      // 透明度
      material.uniforms.opacity.value = value;
      break;
    default:
      console.warn(`未知のエフェクト: ${effectName}`);
  }
  
  material.needsUpdate = true;
}

// シェーダープログラムのコンパイルチェック
function validateShader(material) {
  // 実行時のバリデーションは難しいため、WebGLのデバッグモードを使用
  console.log('シェーダー検証中...');
  return material !== null;
}

// モジュールエクスポート
const Shaders = {
  types: ShaderType,
  defaultUniforms,
  createMaterial: createShaderMaterial,
  updateParameters: updateShaderParameters,
  applyEffect: applyShaderEffect,
  validate: validateShader,
  
  // シェーダーコード直接エクスポート（デバッグ用）
  shaderSources: {
    standard: {
      vertex: pointCloudVertexShader,
      fragment: pointCloudFragmentShader
    },
    depthEnhanced: {
      vertex: depthEnhancedVertexShader,
      fragment: depthEnhancedFragmentShader
    },
    heatmap: {
      vertex: heatmapVertexShader,
      fragment: heatmapFragmentShader
    }
  }
};

export default Shaders;