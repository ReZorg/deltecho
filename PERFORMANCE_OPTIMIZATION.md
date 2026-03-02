# DeltaChat RAGBot Studio - Performance Optimization Guide

## TensorFlow.js Performance Issues & Solutions

### The Problem

TensorFlow.js and the MobileNet model are being loaded automatically when the Deep Tree Echo Bot component mounts, consuming significant CPU and memory resources even when vision features aren't being used.

### Quick Fix - Disable Vision Features

Add this to your app initialization to completely disable TensorFlow.js loading:

```typescript
// In App.tsx or your main component
import { VisionCapabilities } from "./components/chat/VisionCapabilities";

// Disable vision features for better performance
VisionCapabilities.disable();
```

### Performance Impact

- **Without optimization**: TensorFlow.js loads ~10MB+ of JavaScript and models
- **With lazy loading**: Only loads when `/vision` command is used
- **With disable flag**: No TensorFlow.js loaded at all

### Additional Optimizations

1. **Use WebGL Backend** (if needed):

```typescript
// Force WebGL backend for better GPU acceleration
await tf.setBackend("webgl");
```

2. **Limit Model Size**:

- Consider using MobileNet v2 0.5 (smaller model)
- Use quantized models when available

3. **Memory Management**:

```typescript
// Dispose tensors after use
tf.dispose(tensor);
// Or use tidy()
const result = tf.tidy(() => {
  // TensorFlow operations
});
```

4. **Worker Thread Option**:
   Consider moving TensorFlow.js to a Web Worker to avoid blocking the main thread:

```typescript
// vision.worker.ts
self.addEventListener("message", async (e) => {
  if (e.data.action === "analyze") {
    const tf = await import("@tensorflow/tfjs");
    const mobilenet = await import("@tensorflow-models/mobilenet");
    // Process image in worker
  }
});
```

### Monitoring Performance

Use Chrome DevTools Performance tab to monitor:

- Check for long tasks caused by TensorFlow.js
- Monitor memory usage spikes
- Use Performance Observer API for real-time metrics

### When to Use Vision Features

Vision features are best for:

- AI companions that need to "see" and understand images
- Visual content moderation
- Image-based conversations

Consider disabling for:

- Text-only chatbots
- Performance-critical applications
- Low-end devices

### Future Improvements

We're working on:

- [ ] Configurable feature flags in settings
- [ ] Smaller, custom-trained models
- [ ] WASM backend option
- [ ] Progressive loading based on usage patterns

---

# New Performance Considerations (Post-Refactor)

This section provides updated performance guidance for the `deltecho` application, focusing on the Live2D avatar and TensorFlow.js.

## 1. Live2D Avatar

- **Model Complexity**: The complexity of the Live2D model can significantly impact performance. Use models with a reasonable number of polygons and textures.
- **Canvas Size**: The size of the canvas used to render the avatar can affect performance. Use the smallest canvas size that meets your needs.
- **Hardware Acceleration**: Ensure that hardware acceleration is enabled in the browser for optimal performance.

## 2. TensorFlow.js

- **Model Size**: Use the smallest TensorFlow.js model that meets your accuracy requirements.
- **Web Workers**: For heavy processing, move the TensorFlow.js logic to a Web Worker to avoid blocking the main thread.
- **WebGL Backend**: Ensure that the WebGL backend is used for TensorFlow.js, as it provides the best performance.
