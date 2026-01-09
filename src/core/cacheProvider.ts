import type { AssessmentInstanceCache } from "./types";
import { loadAssessmentInstanceCache, saveAssessmentInstanceCache, clearAssessmentInstanceCache } from "./storage";

/**
 * Manages assessment instance cache with in-memory storage and persistence
 */
export class AssessmentCacheProvider {
  private cacheByAssessmentId = new Map<string, AssessmentInstanceCache>();
  private courseInstanceId: string;

  constructor(courseInstanceId: string) {
    this.courseInstanceId = courseInstanceId;
  }

  /**
   * Get cache for a specific assessment ID
   * Loads from storage if not in memory
   */
  getCache(assessmentId: string): AssessmentInstanceCache {
    const aid = String(assessmentId || "").trim();
    if (!aid) return { map: new Map(), loadedAt: null };
    
    if (this.cacheByAssessmentId.has(aid)) {
      return this.cacheByAssessmentId.get(aid)!;
    }
    
    const cache = loadAssessmentInstanceCache(this.courseInstanceId, aid);
    this.cacheByAssessmentId.set(aid, cache);
    return cache;
  }

  /**
   * Set cache for a specific assessment ID
   * Saves to both memory and persistent storage
   */
  setCache(assessmentId: string, cache: AssessmentInstanceCache): void {
    const aid = String(assessmentId || "").trim();
    if (!aid) return;
    
    this.cacheByAssessmentId.set(aid, cache);
    saveAssessmentInstanceCache(this.courseInstanceId, aid, cache);
  }

  /**
   * Clear all caches from memory and persistent storage
   */
  clearAll(): void {
    this.cacheByAssessmentId.clear();
    clearAssessmentInstanceCache();
  }

  /**
   * Update the course instance ID and clear existing caches
   */
  setCourseInstanceId(courseInstanceId: string): void {
    if (this.courseInstanceId !== courseInstanceId) {
      this.courseInstanceId = courseInstanceId;
      this.cacheByAssessmentId.clear();
    }
  }
}
