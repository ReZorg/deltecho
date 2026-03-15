/**
 * FeatureMap — Cubism Model Feature Extraction & 2D Image Projection
 *
 * Extracts the drawable mesh topology from a Live2D Cubism model at runtime,
 * organizes drawables into semantic feature regions (face, hair, body, wings, etc.),
 * and provides an API to project 2D images onto specific feature components by
 * computing UV-space bounding boxes and applying texture transformations.
 *
 * Composition: live2d-miara ⊗ live2d-char-model ⊗ rig-logic
 */

// ============================================================
// Types
// ============================================================

/** A single drawable mesh extracted from the Cubism model */
export interface DrawableMesh {
  /** Drawable index in the Cubism model */
  index: number;
  /** Drawable ID string */
  id: string;
  /** Vertex positions [x0,y0, x1,y1, ...] in model space */
  vertexPositions: Float32Array;
  /** UV coordinates [u0,v0, u1,v1, ...] in texture space [0,1] */
  vertexUVs: Float32Array;
  /** Triangle indices */
  indices: Uint16Array;
  /** Number of vertices */
  vertexCount: number;
  /** Opacity of the drawable */
  opacity: number;
  /** Draw order */
  drawOrder: number;
  /** Render order */
  renderOrder: number;
  /** Whether the drawable is currently visible */
  isVisible: boolean;
  /** Texture index this drawable uses */
  textureIndex: number;
  /** Bounding box in model space */
  bounds: BoundingBox;
  /** Bounding box in UV space */
  uvBounds: BoundingBox;
}

/** Axis-aligned bounding box */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** A semantic feature region grouping multiple drawables */
export interface FeatureRegion {
  /** Region identifier */
  name: string;
  /** Human-readable label */
  label: string;
  /** Part IDs that belong to this region */
  partIds: string[];
  /** Drawable meshes in this region */
  drawables: DrawableMesh[];
  /** Combined bounding box in model space */
  bounds: BoundingBox;
  /** Combined bounding box in UV space */
  uvBounds: BoundingBox;
  /** Parameters that control this region */
  controlParams: string[];
}

/** Image projection configuration */
export interface ImageProjection {
  /** Source image (HTMLImageElement, HTMLCanvasElement, or ImageBitmap) */
  source: TexImageSource;
  /** Target feature region name */
  targetRegion: string;
  /** Blend mode: 'replace' overwrites, 'overlay' alpha-blends, 'multiply' multiplies */
  blendMode: 'replace' | 'overlay' | 'multiply';
  /** Opacity of the projected image [0,1] */
  opacity: number;
  /** UV offset for fine positioning */
  uvOffset?: { u: number; v: number };
  /** UV scale for sizing */
  uvScale?: { u: number; v: number };
}

/** Result of a feature map extraction */
export interface FeatureMapSnapshot {
  /** All extracted drawable meshes */
  drawables: DrawableMesh[];
  /** Semantic feature regions */
  regions: Map<string, FeatureRegion>;
  /** Model canvas dimensions */
  canvasSize: { width: number; height: number };
  /** Texture dimensions */
  textureSize: { width: number; height: number };
  /** Timestamp of extraction */
  timestamp: number;
}

// ============================================================
// Feature Region Definitions
// ============================================================

/** Semantic mapping from region names to Cubism Part IDs and control parameters */
export const FEATURE_REGION_DEFS: Record<string, {
  label: string;
  partIds: string[];
  controlParams: string[];
}> = {
  face: {
    label: 'Face',
    partIds: ['PartFace'],
    controlParams: ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ'],
  },
  eyes: {
    label: 'Eyes',
    partIds: ['PartEye'],
    controlParams: ['ParamEyeLOpen', 'ParamEyeROpen', 'ParamEyeBallX', 'ParamEyeBallY'],
  },
  brows: {
    label: 'Eyebrows',
    partIds: ['PartBrow'],
    controlParams: ['ParamBrowLY', 'ParamBrowRY', 'ParamBrowLAngle', 'ParamBrowRAngle', 'ParamBrowLForm', 'ParamBrowRForm'],
  },
  mouth: {
    label: 'Mouth',
    partIds: ['PartMouth'],
    controlParams: ['ParamMouthForm', 'ParamMouthOpenY'],
  },
  hair_front: {
    label: 'Hair Front',
    partIds: ['PartHairFront', 'PartHairAhoge', 'PartHairAccFront'],
    controlParams: ['ParamHairFront', 'ParamHairFront2', 'ParamHairAho1', 'ParamHairAho2'],
  },
  hair_side: {
    label: 'Hair Side',
    partIds: ['PartHairSideL', 'PartHairSideR', 'PartHairSideLBack'],
    controlParams: ['ParamHairSide', 'ParamHairSide2'],
  },
  hair_back: {
    label: 'Hair Back',
    partIds: ['PartHairBack', 'PartHairBackRBack', 'PartHairBackTail', 'PartHairL', 'PartHairR'],
    controlParams: ['ParamHairBack', 'ParamHairBack2', 'ParamHairTail', 'ParamHairTail2'],
  },
  hair_twin: {
    label: 'Hair Twin Tails',
    partIds: ['PartHairTwinL', 'PartHairTwinR'],
    controlParams: ['ParamHairCloth', 'ParamHairCloth2'],
  },
  upper_body: {
    label: 'Upper Body',
    partIds: ['PartUpperBody', 'PartBody', 'PartTrunk'],
    controlParams: ['ParamBodyAngleX', 'ParamBodyAngleZ', 'ParamBreath'],
  },
  bust: {
    label: 'Bust',
    partIds: ['PartBust'],
    controlParams: ['ParamBustX', 'ParamBust'],
  },
  arm_left: {
    label: 'Left Arm',
    partIds: ['PartArmL', 'PartHandL'],
    controlParams: ['ParamArmL1', 'ParamArmL2', 'ParamArmL3', 'ParamFingerL1X', 'ParamFingerL2', 'ParamFingerL3', 'ParamFingerL4'],
  },
  arm_right: {
    label: 'Right Arm',
    partIds: ['PartArmR'],
    controlParams: ['ParamArmR1', 'ParamArmR2', 'ParamArmR3', 'ParamFingerR1', 'ParamFingerR2', 'ParamFingerR3', 'ParamFingerR4'],
  },
  lower_body: {
    label: 'Lower Body',
    partIds: ['PartLowerBody'],
    controlParams: [],
  },
  leg_left: {
    label: 'Left Leg',
    partIds: ['PartLegL'],
    controlParams: ['ParamLegL1X', 'ParamLegL1Z', 'ParamLegL2X', 'ParamLegL2Z', 'ParamLegL3X', 'ParamLegL3Z'],
  },
  leg_right: {
    label: 'Right Leg',
    partIds: ['PartLegR'],
    controlParams: ['ParamLegR1X', 'ParamLegR1Z', 'ParamLegR2X', 'ParamLegR3X', 'ParamLegR3Z'],
  },
  wings_back: {
    label: 'Back Wings',
    partIds: ['PartWingBackLRotation', 'PartWingBackRRotation', 'ArtMesh109_Skinning', 'ArtMesh108_Skinning'],
    controlParams: [],
  },
  wings_front: {
    label: 'Front Wings',
    partIds: ['PartWingL2Rotation', 'PartWingR2Rotation', 'ArtMesh179_Skinning', 'ArtMesh181_Skinning'],
    controlParams: [],
  },
  clothing: {
    label: 'Clothing',
    partIds: ['PartChestClothLRotation', 'PartChestClothRRotation', 'ArtMesh76_Skinning', 'ArtMesh77_Skinning'],
    controlParams: ['ParamCloth1', 'ParamCloth2', 'ParamChestAccessory', 'ParamSleeve', 'ParamSleeveL'],
  },
  fairy: {
    label: 'Fairy Companion',
    partIds: ['PartFairy', 'PartFairyBody', 'PartFairyUpperWingL', 'PartFairyLowerWingL', 'PartFairyUpperWingR', 'PartFairyLowerWingR'],
    controlParams: [],
  },
  environment: {
    label: 'Environment',
    partIds: ['PartBackgroundAll', 'PartBackground', 'PartWaterSurface', 'PartWaterSurfaceUpper', 'PartWaterSurfaceBack', 'PartWaterSurfaceUnder', 'PartWaterSurfaceReflection'],
    controlParams: [],
  },
  effects: {
    label: 'Effects',
    partIds: ['PartSparkle'],
    controlParams: [],
  },
};

// ============================================================
// Utility Functions
// ============================================================

function computeBounds(positions: Float32Array, stride: number = 2): BoundingBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += stride) {
    const x = positions[i];
    const y = positions[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function mergeBounds(boxes: BoundingBox[]): BoundingBox {
  if (boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (b.width === 0 && b.height === 0) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

// ============================================================
// FeatureMap Class
// ============================================================

/**
 * Extracts and manages the feature map from a Live2D Cubism model.
 * 
 * Usage:
 *   const featureMap = new FeatureMap();
 *   featureMap.extract(cubismModel);  // Extract from a loaded model
 *   const faceRegion = featureMap.getRegion('face');
 *   featureMap.projectImage({ source: img, targetRegion: 'face', ... });
 */
export class FeatureMap {
  private drawables: DrawableMesh[] = [];
  private regions: Map<string, FeatureRegion> = new Map();
  private drawableToPartMap: Map<number, string> = new Map();
  private partToRegionMap: Map<string, string> = new Map();
  private canvasSize = { width: 0, height: 0 };
  private textureSize = { width: 0, height: 0 };
  private projectionCanvas: HTMLCanvasElement | null = null;
  private projectionCtx: CanvasRenderingContext2D | null = null;

  /**
   * Extract the feature map from a Cubism core model.
   * Call this after the model is fully loaded and initialized.
   * 
   * @param coreModel - The CubismModel from model.internalModel.coreModel
   * @param model - The pixi-live2d-display Live2DModel for texture access
   */
  extract(coreModel: any, _model?: any): void {
    if (!coreModel || !coreModel._model) {
      throw new Error('FeatureMap.extract requires a valid CubismModel with _model');
    }

    const cubismModel = coreModel._model;
    const drawableCount = cubismModel.drawables.count;
    const partCount = cubismModel.parts.count;

    // Build drawable → part mapping
    this.drawableToPartMap.clear();
    const drawablePartIndices = cubismModel.drawables.parentPartIndices;
    const partIds: string[] = [];
    for (let i = 0; i < partCount; i++) {
      partIds.push(cubismModel.parts.ids[i]);
    }

    // Build part → region mapping
    this.partToRegionMap.clear();
    for (const [regionName, def] of Object.entries(FEATURE_REGION_DEFS)) {
      for (const partId of def.partIds) {
        this.partToRegionMap.set(partId, regionName);
      }
    }

    // Extract canvas size
    const canvasInfo = cubismModel.canvasinfo;
    if (canvasInfo) {
      this.canvasSize = {
        width: canvasInfo.CanvasWidth || canvasInfo.pixelsPerUnit || 1024,
        height: canvasInfo.CanvasHeight || canvasInfo.pixelsPerUnit || 1024,
      };
    }

    // Extract all drawables
    this.drawables = [];
    for (let i = 0; i < drawableCount; i++) {
      const vertexCount = cubismModel.drawables.vertexCounts[i];
      if (vertexCount === 0) continue;

      const positions = cubismModel.drawables.vertexPositions[i];
      const uvs = cubismModel.drawables.vertexUvs[i];
      const indices = cubismModel.drawables.indices[i];
      const opacity = cubismModel.drawables.opacities[i];
      const drawOrder = cubismModel.drawables.drawOrders[i];
      const renderOrder = cubismModel.drawables.renderOrders[i];
      const isVisible = cubismModel.drawables.dynamicFlags[i] !== 0;
      const textureIndex = cubismModel.drawables.textureIndices[i];
      const parentPartIndex = drawablePartIndices ? drawablePartIndices[i] : -1;

      const drawableId = cubismModel.drawables.ids[i] || `drawable_${i}`;

      // Map drawable to its parent part
      if (parentPartIndex >= 0 && parentPartIndex < partIds.length) {
        this.drawableToPartMap.set(i, partIds[parentPartIndex]);
      }

      const mesh: DrawableMesh = {
        index: i,
        id: drawableId,
        vertexPositions: positions ? new Float32Array(positions) : new Float32Array(0),
        vertexUVs: uvs ? new Float32Array(uvs) : new Float32Array(0),
        indices: indices ? new Uint16Array(indices) : new Uint16Array(0),
        vertexCount,
        opacity,
        drawOrder,
        renderOrder,
        isVisible,
        textureIndex,
        bounds: positions ? computeBounds(new Float32Array(positions)) : computeBounds(new Float32Array(0)),
        uvBounds: uvs ? computeBounds(new Float32Array(uvs)) : computeBounds(new Float32Array(0)),
      };

      this.drawables.push(mesh);
    }

    // Build feature regions
    this.regions.clear();
    for (const [regionName, def] of Object.entries(FEATURE_REGION_DEFS)) {
      const regionDrawables = this.drawables.filter(d => {
        const partId = this.drawableToPartMap.get(d.index);
        return partId !== undefined && def.partIds.includes(partId);
      });

      const region: FeatureRegion = {
        name: regionName,
        label: def.label,
        partIds: def.partIds,
        drawables: regionDrawables,
        bounds: mergeBounds(regionDrawables.map(d => d.bounds)),
        uvBounds: mergeBounds(regionDrawables.map(d => d.uvBounds)),
        controlParams: def.controlParams,
      };

      this.regions.set(regionName, region);
    }
  }

  /**
   * Get a snapshot of the current feature map state.
   */
  getSnapshot(): FeatureMapSnapshot {
    return {
      drawables: [...this.drawables],
      regions: new Map(this.regions),
      canvasSize: { ...this.canvasSize },
      textureSize: { ...this.textureSize },
      timestamp: Date.now(),
    };
  }

  /**
   * Get a specific feature region by name.
   */
  getRegion(name: string): FeatureRegion | undefined {
    return this.regions.get(name);
  }

  /**
   * Get all feature region names.
   */
  getRegionNames(): string[] {
    return Array.from(this.regions.keys());
  }

  /**
   * Get all drawables in a region.
   */
  getRegionDrawables(regionName: string): DrawableMesh[] {
    return this.regions.get(regionName)?.drawables || [];
  }

  /**
   * Get the UV bounding box for a region (for texture projection).
   */
  getRegionUVBounds(regionName: string): BoundingBox | undefined {
    return this.regions.get(regionName)?.uvBounds;
  }

  /**
   * Get the model-space bounding box for a region.
   */
  getRegionBounds(regionName: string): BoundingBox | undefined {
    return this.regions.get(regionName)?.bounds;
  }

  /**
   * Find which region a model-space point falls within.
   */
  hitTest(x: number, y: number): string | null {
    for (const [name, region] of this.regions) {
      const b = region.bounds;
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) {
        return name;
      }
    }
    return null;
  }

  /**
   * Project a 2D image onto a feature region by compositing it into the
   * model's texture atlas at the region's UV coordinates.
   * 
   * This creates an offscreen canvas, draws the original texture, then
   * composites the source image into the UV bounding box of the target region.
   * Returns the composited canvas for use as a replacement texture.
   * 
   * @param projection - Image projection configuration
   * @param originalTexture - The original texture image/canvas
   * @returns A canvas with the composited texture, or null if region not found
   */
  projectImage(
    projection: ImageProjection,
    originalTexture: TexImageSource
  ): HTMLCanvasElement | null {
    const region = this.regions.get(projection.targetRegion);
    if (!region || region.drawables.length === 0) return null;

    const uvBounds = region.uvBounds;
    if (uvBounds.width === 0 || uvBounds.height === 0) return null;

    // Get or create the projection canvas
    const texWidth = (originalTexture as any).width || 4096;
    const texHeight = (originalTexture as any).height || 4096;

    if (!this.projectionCanvas) {
      this.projectionCanvas = document.createElement('canvas');
      this.projectionCtx = this.projectionCanvas.getContext('2d');
    }
    this.projectionCanvas.width = texWidth;
    this.projectionCanvas.height = texHeight;
    const ctx = this.projectionCtx!;

    // Draw the original texture
    ctx.drawImage(originalTexture as any, 0, 0);

    // Compute the pixel region from UV bounds
    const offsetU = projection.uvOffset?.u || 0;
    const offsetV = projection.uvOffset?.v || 0;
    const scaleU = projection.uvScale?.u || 1;
    const scaleV = projection.uvScale?.v || 1;

    const px = (uvBounds.minX + offsetU) * texWidth;
    const py = (uvBounds.minY + offsetV) * texHeight;
    const pw = uvBounds.width * scaleU * texWidth;
    const ph = uvBounds.height * scaleV * texHeight;

    // Set blend mode
    ctx.globalAlpha = projection.opacity;
    switch (projection.blendMode) {
      case 'multiply':
        ctx.globalCompositeOperation = 'multiply';
        break;
      case 'overlay':
        ctx.globalCompositeOperation = 'source-atop';
        break;
      case 'replace':
      default:
        ctx.globalCompositeOperation = 'source-over';
        break;
    }

    // Draw the source image into the UV region
    ctx.drawImage(projection.source as any, px, py, pw, ph);

    // Reset
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    return this.projectionCanvas;
  }

  /**
   * Get a summary of the feature map for debugging/display.
   */
  getSummary(): { region: string; label: string; drawableCount: number; bounds: BoundingBox; uvBounds: BoundingBox; params: string[] }[] {
    const summary: any[] = [];
    for (const [name, region] of this.regions) {
      if (region.drawables.length > 0) {
        summary.push({
          region: name,
          label: region.label,
          drawableCount: region.drawables.length,
          bounds: region.bounds,
          uvBounds: region.uvBounds,
          params: region.controlParams,
        });
      }
    }
    return summary;
  }

  /**
   * Get the total number of drawables extracted.
   */
  get drawableCount(): number {
    return this.drawables.length;
  }

  /**
   * Get the total number of populated regions.
   */
  get regionCount(): number {
    let count = 0;
    for (const region of this.regions.values()) {
      if (region.drawables.length > 0) count++;
    }
    return count;
  }
}
