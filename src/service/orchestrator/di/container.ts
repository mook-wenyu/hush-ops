/**
 * DI容器配置模块
 *
 * 使用awilix进行依赖注入，简化组件间依赖管理
 *
 * 生命周期策略：
 * - SINGLETON: Repositories, Controller（应用级单例）
 * - SCOPED: 暂未使用（预留给请求级依赖）
 * - TRANSIENT: 默认，每次解析创建新实例
 */

import { createContainer, asClass, asFunction, InjectionMode, Lifetime } from "awilix";
import type { AwilixContainer } from "awilix";
import { PlansRepository } from "../repositories/PlansRepository.js";
import { ExecutionsRepository } from "../repositories/ExecutionsRepository.js";
import { OrchestratorController } from "../controller.js";
import type { OrchestratorControllerOptions } from "../controller.js";
import { joinConfigPath, joinStatePath } from "../../../shared/environment/pathResolver.js";
import { readdirSync, mkdirSync } from "node:fs";

/**
 * DI容器cradle类型定义
 *
 * 扩展此接口以添加新的依赖项，TypeScript将自动推断类型
 */
export interface OrchestratorCradle {
  plansRepository: PlansRepository;
  executionsRepository: ExecutionsRepository;
  orchestratorController: OrchestratorController;
}

/**
 * DI容器配置选项
 */
export interface ContainerOptions {
  /**
   * Controller自定义选项（可选）
   */
  controllerOptions?: OrchestratorControllerOptions;

  /**
   * Plans仓库目录（可选，默认为配置目录）
   */
  plansDirectory?: string;

  /**
   * Executions仓库目录（可选，默认为配置目录）
   */
  executionsDirectory?: string;

  /**
   * 数据库路径（可选，用于approvalStore和toolStreamStore）
   */
  databasePath?: string;
}

/**
 * 创建并配置DI容器
 *
 * @param options 容器配置选项
 * @returns 配置完成的DI容器
 *
 * @example
 * ```ts
 * const container = createOrchestratorContainer();
 * const controller = container.resolve('orchestratorController');
 * ```
 */
export function createOrchestratorContainer(
  options: ContainerOptions = {}
): AwilixContainer<OrchestratorCradle> {
  const container = createContainer<OrchestratorCradle>({
    injectionMode: InjectionMode.CLASSIC  // 使用CLASSIC模式
  });

  // 注册Repositories（SINGLETON生命周期，应用级单例）
  // 使用asFunction创建工厂函数，直接传递options而非依赖注入
  container.register({
    plansRepository: asFunction(() => {
      const dir = options.plansDirectory ?? joinConfigPath("plans");
      return new PlansRepository({ directory: dir });
    }, {
      lifetime: Lifetime.SINGLETON,
      dispose: async (instance) => {
        if (typeof (instance as any).close === 'function') {
          await (instance as any).close();
        }
      },
    }),

    executionsRepository: asFunction(() => {
      if (options.executionsDirectory) {
        return new ExecutionsRepository({ directory: options.executionsDirectory });
      }
      const primary = joinStatePath("runs");
      const legacy = joinConfigPath("executions");
      // 目录预创建 primary
      try { mkdirSync(primary, { recursive: true }); } catch {}
      const primaryCount = (() => { try { return readdirSync(primary).filter(f=>f.endsWith('.json')).length; } catch { return 0; } })();
      const legacyCount = (() => { try { return readdirSync(legacy).filter(f=>f.endsWith('.json')).length; } catch { return 0; } })();
      const chosen = (legacyCount > 0 && primaryCount === 0) ? legacy : primary;
      return new ExecutionsRepository({ directory: chosen });
    }, {
      lifetime: Lifetime.SINGLETON,
      dispose: async (instance) => {
        if (typeof (instance as any).close === 'function') {
          await (instance as any).close();
        }
      },
    }),
  });

  // 注册Controller（SINGLETON生命周期，依赖Repositories）
  container.register({
    orchestratorController: asClass(OrchestratorController, {
      lifetime: Lifetime.SINGLETON,
      dispose: (instance) => instance.close()
    }).inject(() => {
      // 构造函数签名: constructor(options: OrchestratorControllerOptions = {})
      // 需要返回 { options: {...} } 而不是直接返回 {...}
      const mergedOptions: import("../controller.js").OrchestratorControllerOptions = {
        ...(options.controllerOptions ?? {})
      };
      // 条件性添加databasePath以符合 exactOptionalPropertyTypes
      if (options.databasePath !== undefined) {
        (mergedOptions as any).databasePath = options.databasePath;
      }
      // 注入executionsRepository到controller
      (mergedOptions as any).executionsRepository = container.resolve("executionsRepository");
      return { options: mergedOptions };
    })
  });

  return container;
}

/**
 * 辅助函数：从容器解析Controller
 *
 * @param container DI容器
 * @returns OrchestratorController实例
 */
export function resolveController(
  container: AwilixContainer<OrchestratorCradle>
): OrchestratorController {
  return container.resolve("orchestratorController");
}

/**
 * 辅助函数：清理容器资源（调用dispose）
 *
 * @param container DI容器
 * @returns Promise<void>
 */
export async function disposeContainer(
  container: AwilixContainer<OrchestratorCradle>
): Promise<void> {
  await container.dispose();
}
