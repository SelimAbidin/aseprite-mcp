export function documentResult(): Record<string, unknown> {
  return {
    activeFrameNumber: 2,
    activeLayer: {
      name: "Ink",
      path: [2, 1],
      type: "image",
    },
    colorMode: "rgb",
    filename: "/sprites/hero.aseprite",
    frameCount: 4,
    height: 32,
    id: 17,
    isModified: true,
    layers: [
      {
        editable: false,
        name: "Background",
        opacity: 255,
        type: "background",
        visible: true,
      },
      {
        children: [
          {
            editable: true,
            name: "Ink",
            opacity: 255,
            pixels: ["not part of the document contract"],
            type: "image",
            visible: true,
          },
          {
            editable: true,
            name: "Shadows",
            opacity: 128,
            type: "image",
            visible: false,
          },
        ],
        editable: true,
        name: "Character",
        type: "group",
        visible: true,
      },
    ],
    pixels: ["not part of the document contract"],
    slices: [
      {
        bounds: { height: 24, width: 16, x: 8, y: 4 },
        center: { height: 16, width: 8, x: 4, y: 4 },
        name: "body",
        pivot: { x: 8, y: 20 },
      },
    ],
    tags: [
      {
        direction: "forward",
        fromFrame: 1,
        name: "idle",
        repeatCount: 0,
        toFrame: 2,
      },
      {
        direction: "ping-pong",
        fromFrame: 3,
        name: "run",
        repeatCount: 2,
        toFrame: 4,
      },
    ],
    width: 64,
  };
}

export function addedLayerResult(): Record<string, unknown> {
  return {
    document: {
      activeFrameNumber: 1,
      activeLayer: {
        name: "Highlights",
        path: [2],
        type: "image",
      },
      colorMode: "rgb",
      filename: "/sprites/hero.aseprite",
      frameCount: 1,
      height: 32,
      id: 18,
      isModified: true,
      layers: [
        {
          editable: true,
          name: "Layer 1",
          opacity: 255,
          type: "image",
          visible: true,
        },
        {
          editable: true,
          name: "Highlights",
          opacity: 255,
          type: "image",
          visible: true,
        },
      ],
      slices: null,
      tags: null,
      width: 64,
    },
    layer: {
      editable: true,
      name: "Highlights",
      opacity: 255,
      path: [2],
      type: "image",
      visible: true,
    },
  };
}
