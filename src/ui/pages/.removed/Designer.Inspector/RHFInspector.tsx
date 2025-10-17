import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const NodeSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  data: z.object({ label: z.string().optional() }).optional()
});
export type NodeForm = z.infer<typeof NodeSchema>;

export function RHFInspector(props: { node: any | null; onChange: (patch: Partial<any>) => void }) {
  const { node, onChange } = props;
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<NodeForm>({
    resolver: zodResolver(NodeSchema),
    defaultValues: node ?? { id: "" }
  });

  useEffect(() => { reset(node ?? { id: "" }); }, [node, reset]);

  const onSubmit = (values: NodeForm) => {
    onChange({ type: values.type, data: { ...(node?.data ?? {}), label: values.data?.label } });
  };

  return (
    <div className="card bg-base-200/50">
      <div className="card-body p-3 space-y-2">
        <h3 className="font-semibold text-sm">属性（表单）</h3>
        {!node && <div className="text-xs opacity-60">未选择节点</div>}
        {node && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
            <div className="form-control">
              <label className="label"><span className="label-text">ID</span></label>
              <input className="input input-sm input-bordered" {...register("id")} readOnly />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">标题</span></label>
              <input className="input input-sm input-bordered" {...register("data.label")} />
              {errors.data?.label && <span className="text-error text-xs">{String(errors.data.label.message)}</span>}
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">类型</span></label>
              <input className="input input-sm input-bordered" {...register("type")} />
              {errors.type && <span className="text-error text-xs">{String(errors.type.message)}</span>}
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-xs btn-primary">应用</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
