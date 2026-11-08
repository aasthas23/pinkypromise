import "./theme.css";
import { fade } from "@remotion/transitions/fade";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import type React from "react";
import { Composition } from "remotion";
import { BriefingScene, CallOverScene, LiveCall } from "./scenes/Call";
import { Brand, ColdOpen, HomeTour, Scenarios, VerifyFlow } from "./scenes/Intro";
import { Close, Debrief, Insight } from "./scenes/Outro";

/** Scene order and lengths follow STORYBOARD.md. */
export const SCENES: { id: string; frames: number; C: () => React.JSX.Element }[] = [
  { id: "cold-open", frames: 195, C: ColdOpen },
  { id: "brand", frames: 165, C: Brand },
  { id: "home", frames: 225, C: HomeTour },
  { id: "verify", frames: 225, C: VerifyFlow },
  { id: "scenarios", frames: 195, C: Scenarios },
  { id: "briefing", frames: 210, C: BriefingScene },
  { id: "live-call", frames: 660, C: LiveCall },
  { id: "call-over", frames: 135, C: CallOverScene },
  { id: "debrief", frames: 285, C: Debrief },
  { id: "insight", frames: 195, C: Insight },
  { id: "close", frames: 225, C: Close },
];
const T = 15; // cross-dissolve length
export const TOTAL = SCENES.reduce((n, s) => n + s.frames, 0) - T * (SCENES.length - 1);

function Demo() {
  return (
    <TransitionSeries>
      {SCENES.flatMap(({ id, frames, C }, i) => [
        <TransitionSeries.Sequence key={id} durationInFrames={frames}>
          <C />
        </TransitionSeries.Sequence>,
        ...(i < SCENES.length - 1
          ? [<TransitionSeries.Transition key={`${id}-t`} presentation={fade()} timing={linearTiming({ durationInFrames: T })} />]
          : []),
      ])}
    </TransitionSeries>
  );
}

export function RemotionRoot() {
  return (
    <>
      <Composition id="PinkyPromiseDemo" component={Demo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
      {SCENES.map(({ id, frames, C }) => (
        <Composition key={id} id={`scene-${id}`} component={C} durationInFrames={frames} fps={30} width={1920} height={1080} />
      ))}
    </>
  );
}
