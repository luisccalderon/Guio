import type { PointRef, Script, Skeleton, SkeletonBlock, SkeletonPoint } from "../domain/schemas";
import { hashText } from "../hash";

function hashPoint(point: SkeletonPoint): string {
  return hashText(JSON.stringify([point.text, point.keyPointId, point.sourceIds]));
}

export function computePointRefs(block: SkeletonBlock): PointRef[] {
  return block.points.map((point) => ({ pointId: point.id, hash: hashPoint(point) }));
}

function sameRefs(a: PointRef[], b: PointRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((ref, index) => ref.pointId === b[index]?.pointId && ref.hash === b[index]?.hash)
  );
}

export function staleBlockIds(script: Script, skeleton: Skeleton): string[] {
  return script.blocks
    .filter((block) => {
      const source = skeleton.blocks.find((candidate) => candidate.id === block.skeletonBlockId);
      return source === undefined || !sameRefs(block.pointRefs, computePointRefs(source));
    })
    .map((block) => block.id);
}
