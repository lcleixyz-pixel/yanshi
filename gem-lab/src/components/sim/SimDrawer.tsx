import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * 手机抽屉仲裁：控制、引导任务、记录三个抽屉一次只展开一个，后打开的浮在上面，
 * 先打开的收起但仍留在文档里（收起不是卸载，进度与输入都不丢）。
 * 桌面不受影响：三块面板各在自己的位置上并存。
 * 规则来自 docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 6 条。
 */

export type SimDrawerId = 'controls' | 'task' | 'record';

interface SimDrawerRegistry {
  register: (id: SimDrawerId, open: boolean) => void;
  /** 是否被后打开的抽屉压住（手机样式据此隐藏）。 */
  suppressed: (id: SimDrawerId) => boolean;
}

const SimDrawerContext = createContext<SimDrawerRegistry | null>(null);

export function SimDrawerProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<readonly SimDrawerId[]>([]);
  const register = useCallback((id: SimDrawerId, open: boolean) => {
    setStack((current) => {
      const without = current.filter((item) => item !== id);
      return open ? [...without, id] : without;
    });
  }, []);
  const value = useMemo<SimDrawerRegistry>(() => ({
    register,
    suppressed: (id) => stack.length > 1 && stack[stack.length - 1] !== id,
  }), [register, stack]);
  return <SimDrawerContext.Provider value={value}>{children}</SimDrawerContext.Provider>;
}

/** 注册一个抽屉；返回它在手机上是否被压住（外壳之外单独使用时恒为 false）。 */
export function useSimDrawer(id: SimDrawerId, open: boolean): boolean {
  const registry = useContext(SimDrawerContext);
  const register = registry?.register;
  useEffect(() => { register?.(id, open); }, [register, id, open]);
  return registry ? registry.suppressed(id) : false;
}
