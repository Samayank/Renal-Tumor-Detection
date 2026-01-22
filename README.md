What This Project Does

1. Takes raw CT scans (.nii.gz)

2. Automatically segments:

-Kidney
-Renal Tumor

2. Outputs clinically usable NIfTI masks

3. Preserves spatial metadata (affine, spacing)

4. No manual annotation. No slice-wise shortcuts. Fully 3D.

Key Highlights

 -True 3D U-Net (not 2D slice stacking)

 -Patch-based training & inference (GPU-friendly)

 -Tversky Loss to handle extreme class imbalance

 -Medical preprocessing (HU, resampling, normalization)

 -Output compatible with 3D Slicer / ITK-SNAP

 -Cross-validation supported via MIScnn

 -Dataset

KiTS19 – Kidney Tumor Segmentation Challenge

  300 abdominal CT volumes
  
  Labels:
  
  0 → Background
  
  1 → Kidney
  
  2 → Tumor
  
  Format: NIfTI (.nii.gz)

Model Overview

  Architecture: 3D U-Net
  
  Input: 3D patches (e.g. 64×128×128)
  
  Output: Voxel-wise probability map (3 classes)
  
  Loss: Tversky Loss (Dice-style, imbalance aware)
  
  Optimizer: Adam

Preprocessing Pipeline

  CT scans are messy. This pipeline fixes that:
  
  HU Transformation – raw pixels → Hounsfield Units
  
  Intensity Clipping – focus on soft tissue
  
  Isotropic Resampling – uniform voxel spacing (1mm³)
  
  Normalization – stable learning
  
  Patch Extraction
    Random crops for training
    Overlapping grid for inference

Results (3-Fold Cross-Validation)
  Class	Median Dice Score
  - Kidney	~0.96
  - Tumor	~0.79

Observations

  Kidney segmentation is extremely reliable
  
  Tumor segmentation is harder (small size, low contrast)
  
  Model struggles mainly on very small / infiltrative tumors

Output

  Saved as .nii.gz
  
  Original affine matrix preserved
  
  Direct overlay on CT scans in:
  
  3D Slicer
  
  ITK-SNAP

Environment Setup
  Python	3.8+
  TensorFlow-GPU	2.8.0
  MIScnn	0.8.2
  NumPy	1.21.5
  NiBabel	3.2.2
  SciPy	1.7.3

Future Work
  -Attention U-Net / Transformer hybrids
  
  -Smarter patch sampling (tumor-aware)
  
  -Model ensembling
  
  -Advanced 3D augmentation
  
  -Post-processing (connected components)
  
  -Explainable AI (XAI) overlays

Authors
  Daksh Singla
  Sarthak Vishal Luhadia
  Samayank Goel
  
  B.Tech CSE (AI & Robotics)
  Vellore Institute of Technology, Chennai
