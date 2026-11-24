// The demo project's Root: the template composition, the untell example and the README's demo films.
// (untell render needs no entry here; Remotion Studio uses this Root.)
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { sceneComposition } from "./untell/film";
import { UntellExample } from "./films/UntellExample";
import * as drop from "./films/drop";
import * as dropDraft from "./films/drop-draft";
import * as kiln from "./films/kiln-queue";

export const Drop = sceneComposition("drop", drop);
export const DropDraft = sceneComposition("drop-draft", dropDraft);
export const Kiln = sceneComposition("kiln-queue", kiln);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition {...UntellExample} />
      <Composition {...Drop} />
      <Composition {...DropDraft} />
      <Composition {...Kiln} />
    </>
  );
};
