// A Remotion root for the 3D test films only (src/films/blocks/three.tsx), so Remotion's own renderer can render
// them without the repository registry: bun scripts/render.ts <id> --root src/films/blocks/three-root.tsx --via framework
import { Composition, registerRoot, staticFile } from "remotion";
import { FILMS } from "./three";

(globalThis as unknown as { __vsAssets?: string }).__vsAssets = staticFile("media") + "/";

const Root = () => (
  <>
    {Object.entries(FILMS).map(([id, e]) => {
      const C = e.component, props = e.props;
      return <Composition key={id} id={id} component={() => <C {...props} />} defaultProps={{}} width={e.width} height={e.height}
        fps={e.fps} durationInFrames={e.durationInFrames} />;
    })}
  </>
);

registerRoot(Root);
