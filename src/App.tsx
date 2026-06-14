import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import {
  Camera,
  Image as ImageIcon,
  LockKeyhole,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ClipService } from "./services/clip.service";

const SUPABASE_URL = "https://vhsikdgkzecdfopkpzum.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoc2lrZGdremVjZGZvcGtwenVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjgyMTcsImV4cCI6MjA5Njg0NDIxN30.bj1yl4azsk8X-V2I1C6l5Qpa0kqt6j0TP4ZCJ3Du0l4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type ProductSide = "trái" | "phải" | "cả hai";
type SideFilter = ProductSide | "tất cả";

interface ProductImageRecord {
  id?: string;
  image_url?: string | null;
  storage_path?: string | null;
}

interface ProductRecord {
  id: string;
  component_code: string;
  bom_code?: string | null;
  feature: string | null;
  side: ProductSide;
  user_id: string;
  created_at?: string;
  product_images?: ProductImageRecord[];
  image_url?: string | null;
  storage_path?: string | null;
  similarity?: number;
}

interface ProductCard {
  id: string;
  component_code: string;
  bom_code: string;
  feature: string;
  side: ProductSide;
  user_id: string;
  image_url: string;
  storage_paths: string[];
  similarity?: number;
}

type AiStatus = "idle" | "loading" | "ready" | "error";

const DEFAULT_DISPLAY_LIMIT = 20;
const MAX_IMAGES_PER_PRODUCT = 4;
const SIGNED_URL_TTL_SECONDS = 60 * 30;

const sideOptions: ProductSide[] = ["trái", "phải", "cả hai"];
const filterOptions: SideFilter[] = ["tất cả", ...sideOptions];

const emptyForm = {
  component_code: "",
  bom_code: "",
  feature: "",
  side: "cả hai" as ProductSide,
  files: [] as File[],
};

const compressImage = async (file: File): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được file ảnh."));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error("File ảnh không hợp lệ."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 1024;
        let { width, height } = img;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Trình duyệt không hỗ trợ xử lý ảnh."));
          return;
        }

        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Không thể nén ảnh."));
              return;
            }
            resolve(new File([blob], "compressed.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.82,
        );
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiProgress, setAiProgress] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductCard | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSide, setFilterSide] = useState<SideFilter>("tất cả");
  const [displayLimit, setDisplayLimit] = useState(DEFAULT_DISPLAY_LIMIT);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const clipServiceRef = useRef<ClipService | null>(null);

  useEffect(() => {
    const clipService = new ClipService((update) => {
      setAiStatus(update.status);
      setAiProgress(update.progress);
      setAiError(update.error ?? null);
    });

    clipServiceRef.current = clipService;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
      clipService.terminate();
      clipServiceRef.current = null;
    };
  }, []);

  const signImageUrl = async (image: ProductImageRecord) => {
    if (image.storage_path) {
      const { data, error } = await supabase.storage
        .from("product-images")
        .createSignedUrl(image.storage_path, SIGNED_URL_TTL_SECONDS);

      if (!error && data?.signedUrl) return data.signedUrl;
    }

    return image.image_url ?? "";
  };

  const toProductCards = async (records: ProductRecord[]): Promise<ProductCard[]> =>
    Promise.all(
      records.map(async (product) => {
        const images = product.product_images ?? [
          { image_url: product.image_url, storage_path: product.storage_path },
        ];
        const firstImage = images[0];

        return {
          id: product.id,
          component_code: product.component_code,
          bom_code: product.bom_code ?? "",
          feature: product.feature ?? "",
          side: product.side,
          user_id: product.user_id,
          image_url: firstImage ? await signImageUrl(firstImage) : "",
          storage_paths: images
            .map((image) => image.storage_path)
            .filter((path): path is string => Boolean(path)),
          similarity: product.similarity,
        };
      }),
    );

  const fetchProducts = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, component_code, bom_code, feature, side, user_id, created_at, product_images(id, image_url, storage_path)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      alert(`Lỗi tải dữ liệu: ${error.message}`);
    } else {
      setProducts(await toProductCards(data as ProductRecord[]));
      setDisplayLimit(DEFAULT_DISPLAY_LIMIT);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchProducts();
  }, [user]);

  useEffect(() => {
    setDisplayLimit(DEFAULT_DISPLAY_LIMIT);
  }, [filterSide, searchTerm]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSide = filterSide === "tất cả" || product.side === filterSide;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        product.component_code.toLowerCase().includes(normalizedSearch) ||
        product.bom_code.toLowerCase().includes(normalizedSearch) ||
        product.feature.toLowerCase().includes(normalizedSearch);

      return matchesSide && matchesSearch;
    });
  }, [filterSide, products, searchTerm]);

  const visibleProducts = filteredProducts.slice(0, displayLimit);

  const getClipVector = async (file: File) => {
    const clipService = clipServiceRef.current;
    if (!clipService) {
      throw new Error("CLIP worker chưa được khởi tạo.");
    }

    if (aiStatus !== "ready") {
      setAiStatus("loading");
      setAiError(null);
    }

    return clipService.extractVector(file);
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    setFormData((current) => ({
      ...current,
      files: [...current.files, ...imageFiles].slice(0, MAX_IMAGES_PER_PRODUCT),
    }));
  };

  const uploadProductImages = async (productId: string, files: File[]) => {
    if (!user || files.length === 0) return;

    const imagePayloads = [];
    let skippedEmbeddings = 0;

    for (const file of files) {
      const compressed = await compressImage(file);
      let vector: number[] | null = null;

      try {
        vector = await getClipVector(compressed);
      } catch (error) {
        skippedEmbeddings += 1;
        setAiStatus("error");
        setAiError(error instanceof Error ? error.message : "Không tạo được vector AI.");
      }

      const path = `${user.id}/${productId}/${crypto.randomUUID()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, compressed, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      imagePayloads.push({
        product_id: productId,
        storage_path: path,
        image_url: null,
        embedding: vector,
      });
    }

    const { error: imageError } = await supabase.from("product_images").insert(imagePayloads);
    if (imageError) throw imageError;

    if (skippedEmbeddings > 0) {
      setOperationMessage(
        `Đã lưu ${files.length} ảnh. Có ${skippedEmbeddings} ảnh chưa có vector AI vì model chưa tải được.`,
      );
    }
  };

  const closeForm = () => {
    setShowFormModal(false);
    setEditingProduct(null);
    setFormData(emptyForm);
  };

  const handleEdit = (product: ProductCard) => {
    setEditingProduct(product);
    setFormData({
      component_code: product.component_code,
      bom_code: product.bom_code,
      feature: product.feature,
      side: product.side,
      files: [],
    });
    setShowFormModal(true);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return alert("Vui lòng đăng nhập lại.");
    if (!editingProduct && formData.files.length === 0) {
      return alert("Vui lòng thêm ít nhất 1 ảnh.");
    }

    setLoading(true);
    setOperationMessage(null);

    try {
      const productPayload = {
        component_code: formData.component_code.trim(),
        bom_code: formData.bom_code.trim() || null,
        feature: formData.feature.trim(),
        side: formData.side,
        user_id: user.id,
      };

      let productId = editingProduct?.id;

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(productPayload)
          .eq("id", editingProduct.id)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { data: product, error } = await supabase
          .from("products")
          .insert(productPayload)
          .select("id")
          .single();

        if (error) throw error;
        if (!product?.id) throw new Error("Supabase không trả về product_id.");
        productId = product.id;
      }

      await uploadProductImages(productId!, formData.files);
      closeForm();
      await fetchProducts();
      alert(editingProduct ? "Cập nhật linh kiện thành công." : "Lưu linh kiện thành công.");
    } catch (error) {
      alert(`Lỗi lưu dữ liệu: ${error instanceof Error ? error.message : "Không xác định"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (product: ProductCard) => {
    if (!user) return;
    const confirmed = window.confirm(`Xóa linh kiện ${product.component_code}?`);
    if (!confirmed) return;

    setLoading(true);
    try {
      if (product.storage_paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("product-images")
          .remove(product.storage_paths);
        if (storageError) throw storageError;
      }

      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id)
        .eq("user_id", user.id);

      if (error) throw error;
      await fetchProducts();
    } catch (error) {
      alert(`Lỗi xóa dữ liệu: ${error instanceof Error ? error.message : "Không xác định"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAiSearch = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLoading(true);

    try {
      const compressed = await compressImage(file);
      const vector = await getClipVector(compressed);
      const { data, error } = await supabase.rpc("match_images", {
        query_embedding: vector,
        match_threshold: 0.3,
        match_count: 10,
      });

      if (error) throw error;

      setProducts(await toProductCards(data as ProductRecord[]));
      setDisplayLimit(DEFAULT_DISPLAY_LIMIT);
    } catch (error) {
      alert(`Lỗi tìm kiếm AI: ${error instanceof Error ? error.message : "Không xác định"}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setAuthMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (error) throw error;
      setAuthPassword("");
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Không đăng nhập được. Vui lòng kiểm tra tài khoản được cấp quyền.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setLoading(true);
    setAuthMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) throw error;
      setAuthMessage("Đã gửi link đăng nhập. Kiểm tra email công ty của anh.");
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Không gửi được magic link. Email này có thể chưa được cấp quyền.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenZoom = (url: string) => {
    setZoomImage(url);
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  const closeZoom = () => {
    setZoomImage(null);
    setIsDragging(false);
  };

  useEffect(() => {
    if (!zoomImage) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeZoom();
      if (event.key === "+" || event.key === "=") {
        setScale((value) => Math.min(6, value + 0.25));
      }
      if (event.key === "-") {
        setScale((value) => Math.max(0.4, value - 0.25));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomImage]);

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: event.clientX - position.x, y: event.clientY - position.y });
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
  };

  const aiLabel =
    aiStatus === "idle"
      ? "AI tải khi cần"
      : aiStatus === "ready"
        ? "AI sẵn sàng"
        : aiStatus === "error"
          ? "Lỗi tải AI"
          : `Đang tải CLIP ${aiProgress}%`;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="sticky top-0 z-50 bg-[#ee4d2d] px-6 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-3">
            <Sparkles className="text-yellow-300" size={28} />
            <div>
              <h1 className="text-xl font-bold uppercase">Sổ Tay Linh Kiện Sofa</h1>
              <p className="text-xs text-white/80">Tra cứu khung sườn bằng ảnh, mã linh kiện và BOM</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                aiStatus === "ready" ? "bg-green-500" : "bg-yellow-500"
              }`}
              title={aiError ?? undefined}
            >
              <RefreshCw size={12} className={aiStatus === "loading" ? "animate-spin" : ""} />
              {aiLabel}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded bg-black/20 p-2 hover:bg-black/30"
              title="Đăng xuất"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl px-4">
        <div className="mb-6 flex flex-col gap-4 rounded-lg border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500"
                placeholder="Tìm mã, BOM hoặc đặc trưng..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {filterOptions.map((side) => (
                <button
                  key={side}
                  onClick={() => setFilterSide(side)}
                  className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-bold capitalize transition ${
                    filterSide === side ? "bg-orange-500 text-white" : "bg-white text-gray-600"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-xs font-bold text-white hover:bg-yellow-600">
              <Camera size={16} /> Tìm bằng AI
              <input
                type="file"
                className="hidden"
                onChange={handleAiSearch}
                accept="image/*"
                disabled={!user}
              />
            </label>
            <button
              disabled={!user}
              onClick={() => {
                setEditingProduct(null);
                setFormData(emptyForm);
                setShowFormModal(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:bg-gray-300"
            >
              <Plus size={16} /> Thêm Linh Kiện
            </button>
          </div>
        </div>

        {!user && (
          <div className="mx-auto max-w-md rounded-lg border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2 text-orange-600">
                <LockKeyhole size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Đăng nhập nội bộ</h2>
                <p className="text-xs text-gray-500">Chỉ tài khoản đã được cấp quyền mới truy cập dữ liệu công ty.</p>
              </div>
            </div>
            <form onSubmit={handlePasswordSignIn} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500"
                  type="email"
                  placeholder="Email công ty"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  required
                />
              </div>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500"
                  type="password"
                  placeholder="Mật khẩu"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
              </div>
              {authMessage && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
                  {authMessage}
                </div>
              )}
              <button
                disabled={loading}
                className="w-full rounded-lg bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:bg-gray-300"
              >
                Đăng Nhập
              </button>
              <button
                type="button"
                disabled={loading || !authEmail.trim()}
                onClick={handleMagicLink}
                className="w-full rounded-lg border py-2 text-sm font-bold text-gray-700 hover:border-orange-500 hover:text-orange-600 disabled:text-gray-300"
              >
                Gửi Magic Link
              </button>
            </form>
          </div>
        )}

        {user && loading && (
          <div className="mb-4 rounded-lg border bg-white p-3 text-sm text-gray-600">
            Đang xử lý dữ liệu...
          </div>
        )}

        {user && operationMessage && (
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            {operationMessage}
          </div>
        )}

        {user && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleProducts.map((product) => (
            <div
              key={`${product.id}-${product.image_url}`}
              className="group relative overflow-hidden rounded-lg border bg-white shadow-sm"
            >
              <div
                onClick={() => product.image_url && handleOpenZoom(product.image_url)}
                className="relative aspect-square cursor-zoom-in overflow-hidden bg-gray-100"
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    loading="lazy"
                    alt={product.component_code}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <ImageIcon size={28} />
                  </div>
                )}
                <span className="absolute bottom-2 right-2 rounded bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  {product.side}
                </span>
                {typeof product.similarity === "number" && (
                  <span className="absolute left-2 top-2 rounded bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    Khớp {Math.round(product.similarity * 100)}%
                  </span>
                )}
              </div>
              <div className="space-y-2 p-3">
                <div>
                  <h3 className="truncate text-sm font-bold">Mã: {product.component_code}</h3>
                  <p className="truncate text-[11px] font-semibold text-orange-600">
                    BOM: {product.bom_code || "Chưa gán"}
                  </p>
                  <p className="line-clamp-2 text-xs text-gray-500">{product.feature}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(product)}
                    className="flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] font-bold text-gray-600 hover:border-orange-500 hover:text-orange-600"
                  >
                    <Pencil size={12} /> Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="rounded border px-2 py-1 text-red-600 hover:border-red-500"
                    title="Xóa linh kiện"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        {user && filteredProducts.length > displayLimit && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setDisplayLimit((limit) => limit + DEFAULT_DISPLAY_LIMIT)}
              className="rounded-lg border bg-white px-5 py-2 text-sm font-bold text-orange-600 hover:border-orange-500"
            >
              Xem thêm
            </button>
          </div>
        )}
      </main>

      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex justify-between bg-orange-500 p-4 font-bold text-white">
              <span>{editingProduct ? "Chỉnh Sửa Linh Kiện" : "Thêm Linh Kiện Đa Góc Chụp"}</span>
              <X className="cursor-pointer" onClick={closeForm} />
            </div>
            <form onSubmit={handleSave} className="space-y-4 overflow-y-auto p-6">
              <input
                className="w-full rounded-lg border p-2"
                placeholder="Mã linh kiện..."
                value={formData.component_code}
                onChange={(event) =>
                  setFormData({ ...formData, component_code: event.target.value })
                }
                required
              />
              <input
                className="w-full rounded-lg border p-2"
                placeholder="Mã BOM / nhóm lắp ráp..."
                value={formData.bom_code}
                onChange={(event) => setFormData({ ...formData, bom_code: event.target.value })}
              />
              <select
                className="w-full rounded-lg border p-2"
                value={formData.side}
                onChange={(event) =>
                  setFormData({ ...formData, side: event.target.value as ProductSide })
                }
              >
                {sideOptions.map((side) => (
                  <option key={side} value={side}>
                    {side}
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-lg border p-2"
                placeholder="Đặc trưng, vị trí lắp ráp, ghi chú nhận diện..."
                value={formData.feature}
                onChange={(event) => setFormData({ ...formData, feature: event.target.value })}
              />

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-500">
                  {editingProduct ? "Ảnh bổ sung" : "Hình ảnh, tối đa 4 góc chụp"}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {formData.files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="relative aspect-square overflow-hidden rounded-lg border bg-gray-100"
                    >
                      <img
                        src={URL.createObjectURL(file)}
                        className="h-full w-full object-cover"
                        alt={`Ảnh ${index + 1}`}
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            files: formData.files.filter((_, fileIndex) => fileIndex !== index),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {formData.files.length < MAX_IMAGES_PER_PRODUCT && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-gray-400 hover:bg-gray-50">
                      <Upload size={20} />
                      <span className="text-[10px]">Thêm ảnh</span>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept="image/*"
                        onChange={(event) => handleFilesSelected(event.target.files)}
                      />
                    </label>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-orange-600">
                  Ảnh mới được lưu bằng storage path private, chỉ người đăng nhập đúng quyền mới tạo
                  signed URL để xem.
                </p>
              </div>

              <button
                disabled={loading}
                className="w-full rounded-lg bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600 disabled:bg-gray-300"
              >
                {loading
                  ? "Đang xử lý AI & tải lên..."
                  : editingProduct
                    ? "Cập Nhật Linh Kiện"
                    : "Lưu Linh Kiện"}
              </button>
            </form>
          </div>
        </div>
      )}

      {zoomImage && (
        <div className="fixed inset-0 z-[100] flex select-none flex-col items-center justify-center bg-black/95">
          <button
            type="button"
            className="absolute right-4 top-4 z-[120] rounded-full bg-white/15 p-3 text-white shadow-lg backdrop-blur hover:bg-white/25"
            onClick={closeZoom}
            title="Đóng"
          >
            <X size={28} />
          </button>
          <div
            className="relative flex w-full flex-1 cursor-move items-center justify-center overflow-hidden"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeZoom();
            }}
            onWheel={(event) => {
              event.preventDefault();
              setScale((value) =>
                event.deltaY < 0 ? Math.min(6, value + 0.2) : Math.max(0.4, value - 0.2),
              );
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchStart={(event) => {
              setIsDragging(true);
              const touch = event.touches[0];
              setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
            }}
            onTouchMove={(event) => {
              if (!isDragging) return;
              const touch = event.touches[0];
              setPosition({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
            }}
            onTouchEnd={() => setIsDragging(false)}
          >
            <img
              src={zoomImage}
              className="max-h-[82vh] max-w-[92vw] shadow-2xl transition-transform duration-100"
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
              }}
              onClick={(event) => event.stopPropagation()}
              alt="Ảnh phóng to"
            />
          </div>
          <div className="relative z-[110] mb-6 flex items-center gap-4 rounded-full bg-white/15 p-3 text-white shadow-xl backdrop-blur-md">
            <button
              className="rounded-full p-2 hover:bg-white/20"
              onClick={() => setScale((value) => Math.max(0.4, value - 0.25))}
              title="Thu nhỏ"
            >
              <ZoomOut size={24} />
            </button>
            <span className="min-w-14 text-center font-mono">{Math.round(scale * 100)}%</span>
            <button
              className="rounded-full p-2 hover:bg-white/20"
              onClick={() => setScale((value) => Math.min(6, value + 0.25))}
              title="Phóng to"
            >
              <ZoomIn size={24} />
            </button>
            <div className="h-6 w-px bg-white/20" />
            <button
              onClick={() => setRotation((value) => (value + 90) % 360)}
              className="flex items-center gap-1 rounded-full px-3 py-2 hover:bg-white/20"
            >
              <RotateCw size={16} /> Xoay
            </button>
            <button
              onClick={() => {
                setScale(1);
                setRotation(0);
                setPosition({ x: 0, y: 0 });
              }}
              className="rounded-full px-3 py-2 text-xs font-bold uppercase hover:bg-white/20"
            >
              Đặt lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
