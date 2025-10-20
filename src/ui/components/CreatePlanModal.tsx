import React, { useEffect, useRef, useState } from 'react';
import { useCreatePlan } from '../queries/plans';

export interface CreatePlanModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (planId: string) => void;
}

/**
 * 计划创建模态窗口组件
 * 使用手动表单管理和验证（遵循项目既有模式）
 */
export function CreatePlanModal({ open, onClose, onSuccess }: CreatePlanModalProps) {
  // 表单字段
  const [description, setDescription] = useState<string>('');
  const [version, setVersion] = useState<string>('1.0.0');

  // 验证错误
  const [descError, setDescError] = useState<string>('');
  const [versionError, setVersionError] = useState<string>('');

  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // 使用 TanStack Query 的 useCreatePlan hook
  const { mutate: createPlan, isPending, error: apiError } = useCreatePlan({
    onSuccess: (data) => {
      // 成功后清空表单并关闭
      setDescription('');
      setVersion('1.0.0');
      setDescError('');
      setVersionError('');
      onSuccess?.(data.id);
      onClose();
    }
  });

  // 打开/关闭逻辑
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (open) {
      try {
        dlg.showModal();
      } catch {
        // 忽略showModal错误
      }
    } else {
      if (dlg.open) {
        dlg.close();
      }
    }
  }, [open]);

  // 表单验证
  const validate = (): boolean => {
    let valid = true;

    // 描述验证：必填，至少3个字符
    if (!description.trim()) {
      setDescError('计划描述不能为空');
      valid = false;
    } else if (description.trim().length < 3) {
      setDescError('计划描述至少需要3个字符');
      valid = false;
    } else {
      setDescError('');
    }

    // 版本验证：必须符合 x.y.z 格式（可选v前缀）
    const versionRegex = /^v?\d+\.\d+\.\d+$/;
    if (!version.trim()) {
      setVersionError('版本号不能为空');
      valid = false;
    } else if (!versionRegex.test(version.trim())) {
      setVersionError('版本号格式应为 x.y.z 或 vx.y.z（例如：1.0.0 或 v1.0.0）');
      valid = false;
    } else {
      setVersionError('');
    }

    return valid;
  };

  // 提交处理
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    // 构建符合后端schema的计划对象
    // 注意：SequenceNodeSchema 要求 children 数组至少有1个元素
    const versionWithPrefix = version.trim().startsWith('v') ? version.trim() : `v${version.trim()}`;
    const newPlan = {
      id: `plan-${Date.now()}`,
      description: description.trim(),
      version: versionWithPrefix,
      entry: 'root',
      nodes: [
        {
          id: 'root',
          type: 'sequence',
          children: ['task1']  // 必须有至少一个子节点
        },
        {
          id: 'task1',
          type: 'local_task',
          driver: 'shell',
          command: 'echo "新建任务，请编辑此节点"'
        }
      ]
    };

    createPlan(newPlan);
  };

  // 关闭处理
  const handleClose = () => {
    if (!isPending) {
      setDescription('');
      setVersion('1.0.0');
      setDescError('');
      setVersionError('');
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={handleClose}
    >
      <div className="modal-box max-w-md">
        <h3 className="font-bold text-lg mb-4">创建新计划</h3>

        <form onSubmit={handleSubmit}>
          {/* 描述字段 */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">计划描述 <span className="text-error">*</span></span>
            </label>
            <input
              type="text"
              className={`input input-bordered w-full ${descError ? 'input-error' : ''}`}
              placeholder="请输入计划描述"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descError) setDescError('');
              }}
              disabled={isPending}
              autoFocus
            />
            {descError && (
              <label className="label">
                <span className="label-text-alt text-error">{descError}</span>
              </label>
            )}
          </div>

          {/* 版本字段 */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">版本号 <span className="text-error">*</span></span>
            </label>
            <input
              type="text"
              className={`input input-bordered w-full ${versionError ? 'input-error' : ''}`}
              placeholder="例如：1.0.0 或 v1.0.0"
              value={version}
              onChange={(e) => {
                setVersion(e.target.value);
                if (versionError) setVersionError('');
              }}
              disabled={isPending}
            />
            {versionError && (
              <label className="label">
                <span className="label-text-alt text-error">{versionError}</span>
              </label>
            )}
          </div>

          {/* API 错误显示 */}
          {apiError && (
            <div className="alert alert-error mb-4">
              <span>{apiError.message ?? '创建失败'}</span>
            </div>
          )}

          {/* 按钮组 */}
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleClose}
              disabled={isPending}
            >
              取消
            </button>
            <button
              type="submit"
              className={`btn btn-primary ${isPending ? 'loading' : ''}`}
              disabled={isPending}
            >
              {isPending ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>

      {/* 背景遮罩 */}
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={handleClose}>关闭</button>
      </form>
    </dialog>
  );
}

export default CreatePlanModal;
