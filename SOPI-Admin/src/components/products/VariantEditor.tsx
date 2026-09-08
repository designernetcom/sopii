import { useState } from 'react';
import { Layers, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button, IconButton } from '@/components/common/Button';
import { Field, Input } from '@/components/common/Field';
import { EmptyState } from '@/components/common/States';
import { AppImage } from '@/components/common/AppImage';
import { MediaPickerModal } from '@/components/modals/MediaPickerModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/utils/cn';
import { COLORS, FABRICS, SIZES } from '@/utils/constants';
import { formatCurrency } from '@/utils/format';
import type { ProductVariant } from '@/types';

export interface VariantEditorProps {
  variants: ProductVariant[];
  onChange: (variants: ProductVariant[]) => void;
  baseSku: string;
  basePrice: number;
}

function OptionPicker({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-700 dark:text-ink-300">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              selected.includes(option)
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VariantEditor({ variants, onChange, baseSku, basePrice }: VariantEditorProps) {
  const toast = useToast();
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [fabrics, setFabrics] = useState<string[]>([]);
  const [imageTarget, setImageTarget] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const generate = () => {
    if (!colors.length && !sizes.length && !fabrics.length) {
      toast.warning('Pick at least one option', 'Choose colours, sizes or fabrics to generate from.');
      return;
    }

    const colorList = colors.length ? colors : [''];
    const sizeList = sizes.length ? sizes : [''];
    const fabricList = fabrics.length ? fabrics : [''];

    const generated: ProductVariant[] = [];
    let index = variants.length;

    colorList.forEach((color) => {
      sizeList.forEach((size) => {
        fabricList.forEach((fabric) => {
          const key = [color, size, fabric].filter(Boolean).join('/');
          const exists = variants.some(
            (variant) =>
              (variant.color ?? '') === color &&
              (variant.size ?? '') === size &&
              (variant.fabric ?? '') === fabric,
          );
          if (exists) return;

          index += 1;
          const suffix = [color.slice(0, 2), size === 'Free Size' ? 'FS' : size, fabric.slice(0, 2)]
            .filter(Boolean)
            .join('')
            .toUpperCase();

          generated.push({
            id: `variant-${Date.now()}-${index}`,
            sku: `${baseSku || 'SOP'}-${suffix || index}`,
            color: color || undefined,
            size: size || undefined,
            fabric: fabric || undefined,
            price: basePrice || 0,
            stock: 0,
            image: undefined,
          });
          void key;
        });
      });
    });

    if (!generated.length) {
      toast.info('Nothing new to add', 'Those combinations already exist.');
      return;
    }

    onChange([...variants, ...generated]);
    toast.success(`${generated.length} variant(s) generated`);
  };

  const update = (id: string, patch: Partial<ProductVariant>) => {
    onChange(variants.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  };

  const totalStock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-ink-200 p-4 dark:border-ink-700">
        <div className="mb-4 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <p className="text-sm font-medium text-ink-800 dark:text-ink-200">Generate variants</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <OptionPicker
            label="Colour"
            options={COLORS}
            selected={colors}
            onToggle={(value) => toggle(colors, setColors, value)}
          />
          <OptionPicker
            label="Size"
            options={SIZES}
            selected={sizes}
            onToggle={(value) => toggle(sizes, setSizes, value)}
          />
          <OptionPicker
            label="Fabric"
            options={FABRICS}
            selected={fabrics}
            onToggle={(value) => toggle(fabrics, setFabrics, value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={generate}
          >
            Generate combinations
          </Button>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {colors.length || 1} × {sizes.length || 1} × {fabrics.length || 1} ={' '}
            {(colors.length || 1) * (sizes.length || 1) * (fabrics.length || 1)} variants
          </p>
        </div>
      </div>

      {variants.length === 0 ? (
        <EmptyState
          compact
          icon={Layers}
          title="No variants yet"
          description="Generate combinations above, or leave empty for a single-SKU product."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500 dark:text-ink-400">
              <span className="font-medium text-ink-800 dark:text-ink-200">{variants.length}</span>{' '}
              variants ·{' '}
              <span className="font-medium text-ink-800 dark:text-ink-200">{totalStock}</span> units
              in stock
            </p>
            <Button
              size="xs"
              variant="ghost"
              icon={<Trash2 className="h-3 w-3" />}
              onClick={() => setClearOpen(true)}
            >
              Clear all
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-700">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 text-2xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Image</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">Variant</th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold">SKU</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Price</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Stock</th>
                  <th scope="col" className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                {variants.map((variant) => (
                  <tr key={variant.id}>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setImageTarget(variant.id)}
                        className="block h-10 w-10 overflow-hidden rounded-lg ring-1 ring-ink-200 transition-shadow hover:ring-brand-400 dark:ring-ink-700"
                        title="Set variant image"
                      >
                        <AppImage
                          src={variant.image}
                          alt={variant.sku}
                          seed={variant.id}
                          wrapperClassName="h-full w-full"
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-ink-800 dark:text-ink-200">
                        {[variant.color, variant.size, variant.fabric].filter(Boolean).join(' / ') ||
                          'Default'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        sizeVariant="sm"
                        value={variant.sku}
                        onChange={(event) => update(variant.id, { sku: event.target.value })}
                        className="font-mono text-xs"
                        aria-label={`SKU for ${variant.sku}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        sizeVariant="sm"
                        type="number"
                        min={0}
                        value={variant.price}
                        onChange={(event) =>
                          update(variant.id, { price: Number(event.target.value) })
                        }
                        className="w-28 text-right tabular-nums"
                        aria-label={`Price for ${variant.sku}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        sizeVariant="sm"
                        type="number"
                        min={0}
                        value={variant.stock}
                        onChange={(event) =>
                          update(variant.id, { stock: Number(event.target.value) })
                        }
                        className="w-24 text-right tabular-nums"
                        aria-label={`Stock for ${variant.sku}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <IconButton
                        label={`Remove variant ${variant.sku}`}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onChange(variants.filter((item) => item.id !== variant.id))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/60">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium text-ink-600 dark:text-ink-400">
                    Totals
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                    {formatCurrency(
                      variants.reduce((sum, variant) => sum + (Number(variant.price) || 0), 0) /
                        (variants.length || 1),
                    )}{' '}
                    avg
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-ink-900 dark:text-ink-100">
                    {totalStock}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <MediaPickerModal
        open={imageTarget !== null}
        onClose={() => setImageTarget(null)}
        multiple={false}
        folder="products"
        title="Select variant image"
        onSelect={(assets) => {
          if (imageTarget && assets[0]) update(imageTarget, { image: assets[0].url });
        }}
      />

      <ConfirmModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => {
          onChange([]);
          setClearOpen(false);
          toast.success('All variants removed');
        }}
        tone="danger"
        title="Remove all variants?"
        description="Every variant SKU, price and stock value on this product will be cleared."
        confirmLabel="Remove all"
      />
    </div>
  );
}

/** Small helper reused by the form to show a field-level hint. */
export function VariantSummaryField({ variants }: { variants: ProductVariant[] }) {
  const stock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
  return (
    <Field
      label="Total stock from variants"
      hint="Stock is calculated from variant quantities when variants exist."
    >
      <Input value={stock} readOnly disabled className="tabular-nums" />
    </Field>
  );
}
