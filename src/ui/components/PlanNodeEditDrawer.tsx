import React, { useEffect, useRef, useState } from 'react';
import type { PlanNodeJson } from './graph/PlanCanvas';
import { NODE_TYPE_OPTIONS, getNodeTypeLabel } from '../constants/nodeTypes';

export interface PlanNodeEditDrawerProps {
  readonly node: PlanNodeJson | null;
  readonly onClose: () => void;
  readonly onSave: (nodeId: string, updates: Partial<Omit<PlanNodeJson, 'id'>>) => void;
}

/**
 * 节点编辑抽屉组件
 * 使用 daisyUI dialog 元素，提供完整的节点编辑表单
 */
export function PlanNodeEditDrawer({ node, onClose, onSave }: PlanNodeEditDrawerProps) {
  // 表单状态
  const [label, setLabel] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [nodeType, setNodeType] = useState<string>('');
  const [requiresApproval, setRequiresApproval] = useState<boolean>(false);
  const [riskLevel, setRiskLevel] = useState<string>('');

  // 验证错误
  const [labelError, setLabelError] = useState<string>('');
  const [nodeTypeError, setNodeTypeError] = useState<string>('');

  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // 打开/关闭逻辑（参考 ExecutionDetailsDrawer）
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (node) {
      // 打开抽屉并填充数据
      setLabel(node.label ?? '');
      setDescription(node.description ?? '');
      setNodeType(node.type ?? '');
      setRequiresApproval(node.requiresApproval ?? false);
      setRiskLevel(node.riskLevel ?? '');
      setLabelError(''); // 清除错误

      try {
        dlg.showModal();
      } catch {
        // 忽略showModal错误
      }
    } else {
      // 关闭抽屉
      if (dlg.open) {
        dlg.close();
      }
    }
  }, [node]);

  // 节点类型变更处理器
  const handleNodeTypeChange = (newType: string) => {
    // 获取旧类型对应的自动生成标签（用于判断用户是否手动修改了label）
    const oldAutoLabel = nodeType ? getNodeTypeLabel(nodeType) : '';
    const newAutoLabel = newType ? getNodeTypeLabel(newType) : '';

    // 更新节点类型状态
    setNodeType(newType);

    // 自动生成label的条件：
    // 1. label 为空（首次选择类型）
    // 2. label 等于旧的自动生成值（用户未手动修改）
    if (!label.trim() || label === oldAutoLabel) {
      setLabel(newAutoLabel);
    }

    // 清除节点类型错误提示
    setNodeTypeError('');
  };

  // 表单验证
  const validate = (): boolean => {
    let valid = true;

    if (!label.trim()) {
      setLabelError('节点标签不能为空');
      valid = false;
    } else {
      setLabelError('');
    }

    if (!nodeType.trim()) {
      setNodeTypeError('节点类型不能为空');
      valid = false;
    } else {
      setNodeTypeError('');
    }

    return valid;
  };

  // 保存逻辑
  const handleSave = () => {
    if (!node) return;

    if (!validate()) {
      return;
    }

    const updates: Partial<Omit<PlanNodeJson, 'id'>> = {};

    // 只提交已修改的字段
    if (label.trim()) updates.label = label.trim();
    if (description.trim()) updates.description = description.trim();
    if (nodeType.trim()) updates.type = nodeType.trim();
    if (riskLevel) updates.riskLevel = riskLevel;
    updates.requiresApproval = requiresApproval;

    onSave(node.id, updates);
    onClose();
  };

  // ESC键关闭
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      id="plan-node-edit-drawer"
      className="modal"
      onKeyDown={handleKeyDown}
      aria-labelledby="drawer-title"
    >
      {/* 背景点击关闭 */}
      <form method="dialog" className="modal-backdrop" onClick={onClose}>
        <button aria-label="关闭抽屉">close</button>
      </form>

      {/* 抽屉内容 */}
      <div className="modal-box w-11/12 max-w-2xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="drawer-title" className="font-semibold text-lg">
            编辑节点
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              aria-label="保存修改"
            >
              保存
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              aria-label="关闭抽屉"
            >
              关闭
            </button>
          </div>
        </div>

        {/* 表单 */}
        <div className="space-y-4">
          {/* 节点标签 - 必填 */}
          <div className="form-control">
            <label className="label" htmlFor="node-label">
              <span className="label-text">节点标签 *</span>
            </label>
            <input
              id="node-label"
              type="text"
              className={`input input-bordered input-sm w-full ${labelError ? 'input-error' : ''}`}
              placeholder="自动根据节点类型生成，可手动修改"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              aria-required="true"
              aria-invalid={!!labelError}
              aria-describedby={labelError ? 'label-error' : undefined}
            />
            {labelError && (
              <label className="label">
                <span id="label-error" className="label-text-alt text-error">{labelError}</span>
              </label>
            )}
          </div>

          {/* 描述 */}
          <div className="form-control">
            <label className="label" htmlFor="node-description">
              <span className="label-text">描述</span>
            </label>
            <textarea
              id="node-description"
              className="textarea textarea-bordered textarea-sm w-full"
              placeholder="输入节点描述（可选）"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="节点描述"
            />
          </div>

          {/* 两列布局：节点类型 + 风险等级 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 节点类型 */}
            <div className="form-control">
              <label className="label" htmlFor="node-type">
                <span className="label-text">节点类型</span>
              </label>
              <select
                id="node-type"
                className={`select select-bordered select-sm w-full ${nodeTypeError ? 'select-error' : ''}`}
                value={nodeType}
                onChange={(e) => handleNodeTypeChange(e.target.value)}
                aria-label="节点类型"
                aria-required="false"
                aria-invalid={!!nodeTypeError}
                aria-describedby={nodeTypeError ? 'node-type-error' : undefined}
              >
                <option value="">请选择节点类型</option>
                {NODE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {nodeTypeError && (
                <label className="label">
                  <span id="node-type-error" className="label-text-alt text-error">{nodeTypeError}</span>
                </label>
              )}
            </div>

            {/* 风险等级 */}
            <div className="form-control">
              <label className="label" htmlFor="node-risk">
                <span className="label-text">风险等级</span>
              </label>
              <select
                id="node-risk"
                className="select select-bordered select-sm w-full"
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                aria-label="风险等级"
              >
                <option value="">无</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          {/* 需要审批 - 复选框 */}
          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3" htmlFor="node-approval">
              <input
                id="node-approval"
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                aria-label="是否需要审批"
              />
              <span className="label-text">需要审批</span>
            </label>
          </div>
        </div>

        {/* 底部提示 */}
        <div className="mt-6 text-sm opacity-70">
          <p>提示：修改后点击"保存"按钮或按 ESC 键关闭抽屉。</p>
        </div>
      </div>
    </dialog>
  );
}
