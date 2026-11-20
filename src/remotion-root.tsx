// The Remotion root, for Remotion's own renderer (`remotion render`), which users run. The recorder
// plays the same compositions in the preview player (src/player.tsx); this file lets us check that
// a real render matches it.
//
//   npx remotion render src/remotion-root.tsx <id> out/render/<id>.mp4 --public-dir assets
//
// Pictures: the renderer serves files only from its public folder. Run it with `--public-dir assets`,
// so assets/media/<name>/plate.jpg is staticFile("media/<name>/plate.jpg").
import { Composition, registerRoot, staticFile } from "remotion";
import { COMPOSITIONS } from "./registry";

(globalThis as unknown as { __vsAssets?: string }).__vsAssets = staticFile("media") + "/";

// Remotion allows only letters, digits and hyphens in a composition id.
// The renderer sends props to the page as JSON, which drops functions, and our props carry the scene
// function. So each composition closes over its own props and takes none.
const valid = Object.entries(COMPOSITIONS).filter(([id]) => /^[a-zA-Z0-9-]+$/.test(id))
  .map(([id, e]) => { const C = e.component, props = e.props; return [id, { ...e, component: () => <C {...props} />, props: {} }] as const; });

const Root = () => (
  <>
    {valid.map(([id, e]) => (
      <Composition key={id} id={id} component={e.component} defaultProps={e.props} width={e.width} height={e.height}
        fps={e.fps} durationInFrames={e.durationInFrames} />
    ))}
  </>
);

registerRoot(Root);
