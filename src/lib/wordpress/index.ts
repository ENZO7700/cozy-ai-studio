/** Client-safe WordPress CCT exports (no Node/server secrets). */
export * from "./types";
export {
  validatePatches,
  briefToSectionPatches,
  isForbiddenCopyValue,
} from "./patch";
export {
  briefForgeToSectionPatches,
  type BriefForgeMetaboxLike,
} from "./briefForgeMap";
