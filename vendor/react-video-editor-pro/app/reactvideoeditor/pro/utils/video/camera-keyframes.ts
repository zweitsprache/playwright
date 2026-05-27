import { CameraKeyframe, ClipOverlay, FocusZoom, ImageOverlay, Overlay, OverlayType } from '../../types';

type CameraKeyframeOwner = {
  cameraKeyframes?: CameraKeyframe[];
  focusZooms?: FocusZoom[];
  durationInFrames: number;
};

export const NEUTRAL_CAMERA_TARGET = { x: 0, y: 0, w: 1, h: 1 };

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

export const normalizeCameraKeyframe = (
  keyframe: CameraKeyframe,
  durationInFrames: number,
): CameraKeyframe => {
  return {
    ...keyframe,
    frame: clamp(Math.round(keyframe.frame), 0, Math.max(0, durationInFrames)),
    mode: keyframe.mode ?? 'fit',
    hold: !!keyframe.hold,
    inheritFromPrevious: !!keyframe.inheritFromPrevious,
    target: {
      x: clamp(keyframe.target.x, 0, 1),
      y: clamp(keyframe.target.y, 0, 1),
      w: clamp(keyframe.target.w, 0.05, 1),
      h: clamp(keyframe.target.h, 0.05, 1),
    },
  };
};

export const normalizeCameraKeyframes = (
  keyframes: CameraKeyframe[] | undefined,
  durationInFrames: number,
): CameraKeyframe[] => {
  if (!keyframes?.length) {
    return [];
  }

  const normalized = keyframes
    .map((keyframe) => normalizeCameraKeyframe(keyframe, durationInFrames))
    .sort((left, right) => left.frame - right.frame);

  return normalized.filter((keyframe, index) => {
    const previous = normalized[index - 1];
    if (!previous) {
      return true;
    }

    return (
      previous.frame !== keyframe.frame ||
      previous.hold !== keyframe.hold ||
      previous.inheritFromPrevious !== keyframe.inheritFromPrevious ||
      previous.mode !== keyframe.mode ||
      previous.target.x !== keyframe.target.x ||
      previous.target.y !== keyframe.target.y ||
      previous.target.w !== keyframe.target.w ||
      previous.target.h !== keyframe.target.h
    );
  });
};

const resolveInheritedCameraKeyframes = (
  keyframes: CameraKeyframe[] | undefined,
  durationInFrames: number,
): CameraKeyframe[] => {
  const normalized = normalizeCameraKeyframes(keyframes, durationInFrames);
  if (!normalized.length) {
    return [];
  }

  return normalized.reduce<CameraKeyframe[]>((resolved, keyframe) => {
    const previous = resolved[resolved.length - 1];
    if (!keyframe.inheritFromPrevious || !previous) {
      resolved.push(keyframe);
      return resolved;
    }

    resolved.push({
      ...keyframe,
      target: previous.target,
      mode: previous.mode,
    });

    return resolved;
  }, []);
};

const normalizeFocusZoom = (
  zoom: FocusZoom,
  durationInFrames: number,
): FocusZoom => {
  const startFrame = clamp(Math.round(zoom.startFrame), 0, Math.max(0, durationInFrames - 1));
  const endFrame = clamp(Math.round(zoom.endFrame), startFrame + 1, durationInFrames);
  const transitionFrames = Math.max(1, zoom.transitionFrames ?? 12);
  const inEndFrame = clamp(
    Math.round(zoom.inEndFrame ?? startFrame + transitionFrames),
    startFrame,
    endFrame,
  );
  const outStartFrame = clamp(
    Math.round(zoom.outStartFrame ?? endFrame - transitionFrames),
    inEndFrame,
    endFrame,
  );

  return {
    ...zoom,
    startFrame,
    endFrame,
    transitionFrames,
    inEndFrame,
    outStartFrame,
  };
};

export const convertLegacyFocusZoomsToCameraKeyframes = (
  focusZooms: FocusZoom[] | undefined,
  durationInFrames: number,
): CameraKeyframe[] => {
  if (!focusZooms?.length) {
    return [];
  }

  const converted: CameraKeyframe[] = [];

  for (const zoom of focusZooms.map((item) => normalizeFocusZoom(item, durationInFrames))) {
    const target = zoom.target;
    const mode = zoom.mode ?? 'fit';
    const inEnd = zoom.inEndFrame ?? zoom.startFrame;
    const outStart = zoom.outStartFrame ?? zoom.endFrame;
    const hasIn = inEnd > zoom.startFrame;
    const hasOut = outStart < zoom.endFrame;
    const startsZoomed = !hasIn;
    const endsZoomed = !hasOut;

    converted.push({
      id: `${zoom.id}_start`,
      frame: zoom.startFrame,
      target: startsZoomed ? target : NEUTRAL_CAMERA_TARGET,
      mode,
      hold: false,
    });

    if (hasIn) {
      converted.push({
        id: `${zoom.id}_in`,
        frame: inEnd,
        target,
        mode,
        hold: false,
      });
    }

    if (outStart > inEnd) {
      converted.push({
        id: `${zoom.id}_hold`,
        frame: outStart,
        target,
        mode,
        hold: true,
      });
    }

    converted.push({
      id: `${zoom.id}_end`,
      frame: zoom.endFrame,
      target: endsZoomed ? target : NEUTRAL_CAMERA_TARGET,
      mode,
      hold: false,
    });
  }

  return normalizeCameraKeyframes(converted, durationInFrames);
};

export const getStoredClipCameraKeyframes = (
  clip: CameraKeyframeOwner,
): CameraKeyframe[] => {
  if (clip.cameraKeyframes?.length) {
    return normalizeCameraKeyframes(clip.cameraKeyframes, clip.durationInFrames);
  }

  return convertLegacyFocusZoomsToCameraKeyframes(
    clip.focusZooms,
    clip.durationInFrames,
  );
};

export const getClipCameraKeyframes = (
  clip: CameraKeyframeOwner,
): CameraKeyframe[] => {
  return resolveInheritedCameraKeyframes(
    getStoredClipCameraKeyframes(clip),
    clip.durationInFrames,
  );
};

export const getEffectiveClipCameraKeyframes = (
  clip: CameraKeyframeOwner,
  inheritedState?: Pick<CameraKeyframe, 'target' | 'mode' | 'hold'>,
): CameraKeyframe[] => {
  const keyframes = getStoredClipCameraKeyframes(clip);
  if (!inheritedState) {
    return resolveInheritedCameraKeyframes(keyframes, clip.durationInFrames);
  }

  const isInheritedNeutral =
    inheritedState.target.x === NEUTRAL_CAMERA_TARGET.x &&
    inheritedState.target.y === NEUTRAL_CAMERA_TARGET.y &&
    inheritedState.target.w === NEUTRAL_CAMERA_TARGET.w &&
    inheritedState.target.h === NEUTRAL_CAMERA_TARGET.h &&
    (inheritedState.mode ?? 'fit') === 'fit';

  if (!keyframes.length) {
    return isInheritedNeutral
      ? []
      : resolveInheritedCameraKeyframes(
          [{
            id: 'inherited_start',
            frame: 0,
            target: inheritedState.target,
            mode: inheritedState.mode ?? 'fit',
            hold: inheritedState.hold,
          }],
          clip.durationInFrames,
        );
  }

  const firstKeyframe = keyframes[0];
  const shouldOverrideFrameZeroWithInheritedState =
    firstKeyframe.frame === 0 &&
    (firstKeyframe.inheritFromPrevious || firstKeyframe.id.endsWith('_split_after'));

  if (shouldOverrideFrameZeroWithInheritedState) {
    return resolveInheritedCameraKeyframes(
      [{
        ...firstKeyframe,
        inheritFromPrevious: false,
        target: inheritedState.target,
        mode: inheritedState.mode ?? 'fit',
        hold: inheritedState.hold,
      }, ...keyframes.slice(1)],
      clip.durationInFrames,
    );
  }

  if (firstKeyframe.frame === 0) {
    return resolveInheritedCameraKeyframes(keyframes, clip.durationInFrames);
  }

  return resolveInheritedCameraKeyframes(
    [{
      id: `${firstKeyframe.id}_inherited_start`,
      frame: 0,
      target: inheritedState.target,
      mode: inheritedState.mode ?? 'fit',
      hold: inheritedState.hold,
    }, ...keyframes],
    clip.durationInFrames,
  );
};

export const getInheritedCameraStateForClip = (
  overlays: Overlay[],
  clip: Pick<ClipOverlay, 'id' | 'from' | 'row'>,
): Pick<CameraKeyframe, 'target' | 'mode' | 'hold'> | undefined => {
  const priorOverlays = overlays
    .filter((candidate) => {
      if (candidate.id === clip.id || candidate.row !== clip.row) {
        return false;
      }

      return candidate.from < clip.from;
    })
    .sort((left, right) => {
      const leftEnd = left.from + left.durationInFrames;
      const rightEnd = right.from + right.durationInFrames;

      if (leftEnd !== rightEnd) {
        return leftEnd - rightEnd;
      }

      if (left.from !== right.from) {
        return left.from - right.from;
      }

      return left.id - right.id;
    });

  let inheritedState: Pick<CameraKeyframe, 'target' | 'mode' | 'hold'> | undefined;

  for (const priorOverlay of priorOverlays) {
    if (priorOverlay.type === OverlayType.VIDEO) {
      const previousClip = priorOverlay as ClipOverlay;
      inheritedState = getCameraStateAtFrame(
        getEffectiveClipCameraKeyframes(previousClip, inheritedState),
        previousClip.durationInFrames,
      );
      continue;
    }

    if (priorOverlay.type === OverlayType.IMAGE) {
      const previousImage = priorOverlay as ImageOverlay;
      if (previousImage.cameraKeyframes?.length) {
        inheritedState = getCameraStateAtFrame(
          getEffectiveClipCameraKeyframes(previousImage, inheritedState),
          previousImage.durationInFrames,
        );
        continue;
      }
    }
  }

  return inheritedState;
};

export const getCameraStateAtFrame = (
  keyframes: CameraKeyframe[] | undefined,
  frame: number,
): Pick<CameraKeyframe, 'target' | 'mode' | 'hold'> => {
  const normalized = resolveInheritedCameraKeyframes(keyframes, Number.MAX_SAFE_INTEGER);
  if (!normalized.length) {
    return {
      target: NEUTRAL_CAMERA_TARGET,
      mode: 'fit',
      hold: false,
    };
  }

  const first = normalized[0];
  if (first.frame > 0 && frame < first.frame) {
    return {
      target: NEUTRAL_CAMERA_TARGET,
      mode: 'fit',
      hold: false,
    };
  }

  return getInterpolatedKeyframe(normalized, frame);
};

export const getCameraTransformAtFrame = (
  keyframes: CameraKeyframe[] | undefined,
  frame: number,
) => {
  const identity = {
    scale: 1,
    translateXPercent: 0,
    translateYPercent: 0,
    transform: 'scale(1)',
    transformOrigin: '50% 50%',
  };

  const getTargetTransform = (target: CameraKeyframe['target'], mode: 'fit' | 'cover') => {
    const targetScale =
      mode === 'cover'
        ? Math.max(1 / target.w, 1 / target.h)
        : Math.min(1 / target.w, 1 / target.h);
    const centerX = target.x + target.w / 2;
    const centerY = target.y + target.h / 2;
    const translateXPercent = (0.5 - centerX) * targetScale * 100;
    const translateYPercent = (0.5 - centerY) * targetScale * 100;

    return {
      scale: targetScale,
      translateXPercent,
      translateYPercent,
      transform: `translate(${translateXPercent}%, ${translateYPercent}%) scale(${targetScale})`,
      transformOrigin: '50% 50%',
    };
  };

  const state = getCameraStateAtFrame(keyframes, frame);
  if (
    state.target.x === NEUTRAL_CAMERA_TARGET.x &&
    state.target.y === NEUTRAL_CAMERA_TARGET.y &&
    state.target.w === NEUTRAL_CAMERA_TARGET.w &&
    state.target.h === NEUTRAL_CAMERA_TARGET.h &&
    (state.mode ?? 'fit') === 'fit'
  ) {
    return identity;
  }

  return getTargetTransform(state.target, state.mode ?? 'fit');
};

export const splitCameraKeyframesAtFrame = (
  keyframes: CameraKeyframe[] | undefined,
  splitFrame: number,
  durationInFrames: number,
): [CameraKeyframe[], CameraKeyframe[]] => {
  const normalized = normalizeCameraKeyframes(keyframes, durationInFrames);
  if (!normalized.length) {
    return [[], []];
  }

  const before = normalizeCameraKeyframes(
    normalized
      .filter((keyframe) => keyframe.frame < splitFrame)
      .concat(
        normalized.some((keyframe) => keyframe.frame === splitFrame)
          ? normalized.filter((keyframe) => keyframe.frame === splitFrame)
          : normalized.length
            ? [{
                ...normalized[0],
                id: `${normalized[0].id}_split_before`,
                frame: splitFrame,
                ...getInterpolatedKeyframe(normalized, splitFrame),
              }]
            : [],
      ),
    Math.max(splitFrame, 1),
  );

  const secondDuration = Math.max(durationInFrames - splitFrame, 1);
  const afterBase = normalized
    .filter((keyframe) => keyframe.frame >= splitFrame)
    .map((keyframe, index) => ({
      ...keyframe,
      id: index === 0 && keyframe.frame === splitFrame ? keyframe.id : keyframe.id,
      frame: Math.max(0, keyframe.frame - splitFrame),
    }));

  const needsBoundary = !normalized.some((keyframe) => keyframe.frame === splitFrame);
  const after = normalizeCameraKeyframes(
    [
      ...(needsBoundary
        ? [{
            ...normalized[0],
            id: `${normalized[0].id}_split_after`,
            frame: 0,
            ...getInterpolatedKeyframe(normalized, splitFrame),
          }]
        : []),
      ...afterBase,
    ],
    secondDuration,
  );

  return [before, after];
};

const getInterpolatedKeyframe = (
  keyframes: CameraKeyframe[],
  frame: number,
): Pick<CameraKeyframe, 'target' | 'mode' | 'hold'> => {
  const normalized = resolveInheritedCameraKeyframes(keyframes, Number.MAX_SAFE_INTEGER);
  if (!normalized.length) {
    return {
      target: NEUTRAL_CAMERA_TARGET,
      mode: 'fit',
      hold: false,
    };
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (frame <= first.frame) {
    return { target: first.target, mode: first.mode, hold: first.hold };
  }
  if (frame >= last.frame) {
    return { target: last.target, mode: last.mode, hold: last.hold };
  }

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const current = normalized[index];
    const upcoming = normalized[index + 1];
    if (frame >= current.frame && frame <= upcoming.frame) {
      if (current.hold || upcoming.frame <= current.frame) {
        return { target: current.target, mode: current.mode, hold: current.hold };
      }
      const progress = (frame - current.frame) / (upcoming.frame - current.frame);
      return {
        target: {
          x: current.target.x + (upcoming.target.x - current.target.x) * progress,
          y: current.target.y + (upcoming.target.y - current.target.y) * progress,
          w: current.target.w + (upcoming.target.w - current.target.w) * progress,
          h: current.target.h + (upcoming.target.h - current.target.h) * progress,
        },
        mode: current.mode ?? upcoming.mode,
        hold: false,
      };
    }
  }

  return { target: last.target, mode: last.mode, hold: last.hold };
};

export const migrateLegacyFocusZoomsInOverlays = (overlays: Overlay[]): Overlay[] => {
  return overlays.map((overlay) => {
    if (overlay.type !== OverlayType.VIDEO) {
      return overlay;
    }

    const clip = overlay as ClipOverlay;
    if (clip.cameraKeyframes?.length || !clip.focusZooms?.length) {
      return overlay;
    }

    return {
      ...clip,
      cameraKeyframes: convertLegacyFocusZoomsToCameraKeyframes(
        clip.focusZooms,
        clip.durationInFrames,
      ),
      focusZooms: undefined,
    };
  });
};
