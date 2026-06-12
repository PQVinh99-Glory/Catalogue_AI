import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plus,
  Search,
  Camera,
  Trash2,
  Edit2,
  LogOut,
  Upload,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  X,
} from 'lucide-react';

// Cấu hình Supabase (Thay thế thông tin dự án của anh trực tiếp tại đây)
const SUPABASE_URL = 'https://vhsikdgkzecdfopkpzum.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoc2lrZGdremVjZGZvcGtwenVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjgyMTcsImV4cCI6MjA5Njg0NDIxN30.bj1yl4azsk8X-V2I1C6l5Qpa0kqt6j0TP4ZCJ3Du0l4';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Định nghĩa dữ liệu chuẩn TypeScript
interface Product {
  id: string;
  component_code: string;
  feature: string;
  side: 'trái' | 'phải' | 'cả hai';
  image_url?: string;
  embedding?: string;
  user_id: string;
  created_at: string;
}

interface FormDataState {
  component_code: string;
  feature: string;
  side: 'trái' | 'phải' | 'cả hai';
  imageFile: File | null;
  imageUrl: string;
  previewUrl: string;
}

interface AiScore {
  id: string;
  score: number;
}

export default function App() {
  // Authentication States
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');

  // App States
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [aiModel, setAiModel] = useState<any>(null);
  const [modelLoading, setModelLoading] = useState<boolean>(true);

  // Form States
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<FormDataState>({
    component_code: '',
    feature: '',
    side: 'cả hai',
    imageFile: null,
    imageUrl: '',
    previewUrl: '',
  });

  // Tìm kiếm & Lọc
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterSide, setFilterSide] = useState<string>('tất cả');

  // Tìm kiếm bằng hình ảnh (AI)
  const [aiSearchPreview, setAiSearchPreview] = useState<string>('');
  const [aiResults, setAiResults] = useState<AiScore[] | null>(null);
  const [isAiSearching, setIsAiSearching] = useState<boolean>(false);

  // Giới hạn số lượng thẻ hiển thị để tối ưu mượt mà (Pagination)
  const [displayLimit, setDisplayLimit] = useState<number>(20);

  // Camera Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Trạng thái đăng nhập
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Tải mô hình AI MobileNet trên trình duyệt
  useEffect(() => {
    const loadMobileNet = async () => {
      try {
        const globalWindow = window as any;
        if (globalWindow.mobilenet) {
          const model = await globalWindow.mobilenet.load();
          setAiModel(model);
        }
      } catch (error) {
        console.error('Lỗi tải mô hình AI:', error);
      } finally {
        setModelLoading(false);
      }
    };
    loadMobileNet();
  }, []);

  // Tải dữ liệu từ database
  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      alert('Không thể tải dữ liệu: ' + error.message);
    } else {
      setProducts((data as Product[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  // Đăng ký & Đăng nhập
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
      else alert('Đăng ký thành công! Vui lòng đăng nhập.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) setAuthError(error.message);
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  // Trích xuất Vector đặc trưng (AI Embeddings)
  const extractFeatures = async (
    imageElement: HTMLImageElement
  ): Promise<number[] | null> => {
    const globalWindow = window as any;
    if (!aiModel || !globalWindow.tf) return null;
    try {
      const activation = aiModel.infer(imageElement, true);
      const embeddingArray = await activation.data();
      return Array.from(embeddingArray);
    } catch (e) {
      console.error('Lỗi trích xuất vector ảnh:', e);
      return null;
    }
  };

  // Tính toán Cosine Similarity để so sánh độ tương đồng 2 bức ảnh
  const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // Các điều khiển camera tích hợp
  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      alert('Không thể mở camera: ' + err.message);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'camera-capture.jpg', {
            type: 'image/jpeg',
          });
          const previewUrl = URL.createObjectURL(blob);
          setFormData((prev) => ({ ...prev, imageFile: file, previewUrl }));
          stopCamera();
        }
      }, 'image/jpeg');
    }
  };

  // Lưu mới hoặc chỉnh sửa dữ liệu
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.component_code) return alert('Mã linh kiện là bắt buộc!');
    setLoading(true);

    try {
      let image_url = formData.imageUrl;

      // 1. Tải ảnh lên Supabase Storage nếu có ảnh mới
      if (formData.imageFile) {
        const fileExt = formData.imageFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, formData.imageFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('product-images').getPublicUrl(fileName);

        image_url = publicUrl;
      }

      // 2. Phân tích vector ảnh thông qua AI
      let embeddingString = null;
      if (image_url) {
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        tempImg.src = image_url;
        await new Promise((resolve) => {
          tempImg.onload = resolve;
          tempImg.onerror = resolve;
        });
        const vector = await extractFeatures(tempImg);
        if (vector) embeddingString = JSON.stringify(vector);
      }

      // 3. Tiến hành ghi nhận thông tin vào Database
      const payload = {
        component_code: formData.component_code,
        feature: formData.feature,
        side: formData.side,
        image_url,
        embedding: embeddingString,
        user_id: user.id,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;
      }

      setFormData({
        component_code: '',
        feature: '',
        side: 'cả hai',
        imageFile: null,
        imageUrl: '',
        previewUrl: '',
      });
      setShowAddModal(false);
      setEditingProduct(null);
      fetchProducts();
    } catch (error: any) {
      alert('Có lỗi xảy ra: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      component_code: product.component_code,
      feature: product.feature,
      side: product.side,
      imageUrl: product.image_url || '',
      previewUrl: product.image_url || '',
      imageFile: null,
    });
    setShowAddModal(true);
  };

  const handleDeleteProduct = async (id: string, imageUrl?: string) => {
    if (!confirm('Bạn chắc chắn muốn xóa linh kiện này?')) return;
    setLoading(true);
    try {
      if (imageUrl) {
        const path = imageUrl.split('/public/product-images/')[1];
        if (path) {
          await supabase.storage.from('product-images').remove([path]);
        }
      }
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      fetchProducts();
    } catch (error: any) {
      alert('Không thể xóa: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Xử lý tìm kiếm bằng hình ảnh (AI Similarity Search)
  const handleAiSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiSearchPreview(URL.createObjectURL(file));
    setIsAiSearching(true);

    try {
      const tempImg = new Image();
      tempImg.src = URL.createObjectURL(file);
      await new Promise((resolve) => (tempImg.onload = resolve));

      const targetVector = await extractFeatures(tempImg);
      if (!targetVector) {
        alert('Không thể trích xuất đặc trưng của ảnh này.');
        setIsAiSearching(false);
        return;
      }

      const scores: AiScore[] = products.map((product) => {
        if (!product.embedding) return { id: product.id, score: 0 };
        try {
          const dbVector = JSON.parse(product.embedding);
          const score = cosineSimilarity(targetVector, dbVector);
          return { id: product.id, score };
        } catch (err) {
          return { id: product.id, score: 0 };
        }
      });

      const sortedScores = scores.sort((a, b) => b.score - a.score);
      setAiResults(sortedScores);
    } catch (err: any) {
      alert('Lỗi phân tích AI: ' + err.message);
    } finally {
      setIsAiSearching(false);
    }
  };

  // Bộ lọc thông thường
  const filteredProducts = products.filter((product) => {
    const matchText =
      product.component_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.feature.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSide = filterSide === 'tất cả' || product.side === filterSide;
    return matchText && matchSide;
  });

  const finalDisplayProducts = aiResults
    ? [...filteredProducts].sort((a, b) => {
        const scoreA = aiResults.find((r) => r.id === a.id)?.score || 0;
        const scoreB = aiResults.find((r) => r.id === b.id)?.score || 0;
        return scoreB - scoreA;
      })
    : filteredProducts;

  const paginatedProducts = finalDisplayProducts.slice(0, displayLimit);

  // Màn hình Đăng nhập bảo mật
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-orange-100">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-orange-500 text-white p-3 rounded-full mb-3">
              <Sparkles size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              Linh Kiện Shopee AI
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Hệ thống phân tích & lưu trữ ảnh mượt mà
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">
                Mật khẩu
              </label>
              <input
                type="password"
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </div>

            {authError && (
              <p className="text-red-500 text-xs italic">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full py-2 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
            >
              {isSignUp ? 'Đăng ký tài khoản' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-orange-500 hover:underline"
            >
              {isSignUp
                ? 'Đã có tài khoản? Đăng nhập'
                : 'Chưa có tài khoản? Đăng ký ngay'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard chính
  return (
    <div className="min-h-screen pb-12">
      {/* Header chuẩn Shopee */}
      <header className="bg-[#ee4d2d] text-white py-4 px-6 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="animate-pulse text-yellow-300" size={28} />
            <h1 className="text-xl font-bold tracking-wider uppercase">
              Linh Kiện AI Dashboard
            </h1>
          </div>

          <div className="flex-1 max-w-xl w-full flex bg-white rounded-md shadow-sm overflow-hidden">
            <input
              type="text"
              placeholder="Tìm kiếm bằng Mã linh kiện hoặc Đặc trưng (Feature)..."
              className="w-full px-4 py-2 text-gray-700 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="bg-[#f94f2f] px-6 text-white hover:bg-[#d44125] transition flex items-center gap-1">
              <Search size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            {modelLoading ? (
              <span className="text-xs bg-yellow-400 text-gray-900 px-2 py-1 rounded flex items-center gap-1">
                <RefreshCw size={12} className="animate-spin" /> Đang tải Model
                AI...
              </span>
            ) : (
              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">
                AI Sẵn sàng
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm bg-black/20 hover:bg-black/40 px-3 py-1.5 rounded transition"
            >
              <LogOut size={16} /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-6">
        {/* Bộ lọc phân loại & các tùy chọn tìm kiếm */}
        <div className="bg-white p-4 rounded-xl shadow-sm border mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
            <span className="text-sm font-semibold text-gray-600 shrink-0">
              Phân loại:
            </span>
            {['tất cả', 'trái', 'phải', 'cả hai'].map((side) => (
              <button
                key={side}
                onClick={() => setFilterSide(side)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border capitalize transition ${
                  filterSide === side
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <label className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg cursor-pointer transition shadow-sm">
              <Camera size={16} />
              <span>Tìm bằng hình ảnh (AI)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAiSearch}
                className="hidden"
              />
            </label>

            <button
              onClick={() => {
                setEditingProduct(null);
                setFormData({
                  component_code: '',
                  feature: '',
                  side: 'cả hai',
                  imageFile: null,
                  imageUrl: '',
                  previewUrl: '',
                });
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition shadow-sm"
            >
              <Plus size={16} /> Thêm Linh Kiện Mới
            </button>
          </div>
        </div>

        {/* Thông báo kết quả so khớp của AI */}
        {aiSearchPreview && (
          <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src={aiSearchPreview}
                alt="Target"
                className="w-16 h-16 object-cover rounded-lg border-2 border-orange-400"
              />
              <div>
                <h4 className="font-semibold text-orange-800 text-sm">
                  Tìm kiếm bằng hình ảnh đang hoạt động
                </h4>
                <p className="text-xs text-orange-600 mt-0.5">
                  Sắp xếp các sản phẩm tương đồng lên trước.
                </p>
                {isAiSearching && (
                  <p className="text-xs text-blue-600 animate-pulse mt-1">
                    Đang xử lý phân tích AI...
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setAiSearchPreview('');
                setAiResults(null);
              }}
              className="text-gray-500 hover:text-red-500"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Danh sách thẻ linh kiện phong cách hiển thị Shopee */}
        {loading && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw
              className="animate-spin text-orange-500 mb-2"
              size={32}
            />
            <p className="text-gray-500">Đang đồng bộ dữ liệu hệ thống...</p>
          </div>
        ) : finalDisplayProducts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed">
            <ImageIcon className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-500">Không tìm thấy linh kiện nào.</p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {paginatedProducts.map((product) => {
                const aiMatch = aiResults?.find((r) => r.id === product.id);
                const scorePercent = aiMatch
                  ? Math.round(aiMatch.score * 100)
                  : null;

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition duration-200 border border-gray-100 flex flex-col group relative"
                  >
                    <div className="relative aspect-square bg-gray-100 overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.component_code}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
                          <ImageIcon size={32} />
                        </div>
                      )}

                      {scorePercent !== null && (
                        <span
                          className={`absolute top-2 left-2 text-[10px] font-bold text-white px-1.5 py-0.5 rounded shadow ${
                            scorePercent > 80
                              ? 'bg-green-600'
                              : scorePercent > 50
                              ? 'bg-yellow-500'
                              : 'bg-gray-500'
                          }`}
                        >
                          Khớp {scorePercent}%
                        </span>
                      )}

                      <span
                        className={`absolute bottom-2 right-2 text-[9px] font-bold uppercase text-white px-1.5 py-0.5 rounded ${
                          product.side === 'trái'
                            ? 'bg-[#ee4d2d]'
                            : product.side === 'phải'
                            ? 'bg-blue-600'
                            : 'bg-emerald-600'
                        }`}
                      >
                        {product.side}
                      </span>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-sm text-gray-900 truncate">
                          Mã: {product.component_code}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 min-h-[2rem]">
                          Đặc trưng: {product.feature || 'Không có mô tả'}
                        </p>
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between opacity-100 sm:opacity-0 group-hover:opacity-100 transition duration-150">
                        <button
                          onClick={() => handleEditClick(product)}
                          className="text-gray-500 hover:text-blue-600 flex items-center gap-0.5 text-xs font-semibold"
                        >
                          <Edit2 size={12} /> Sửa
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteProduct(product.id, product.image_url)
                          }
                          className="text-gray-400 hover:text-red-600 flex items-center gap-0.5 text-xs font-semibold"
                        >
                          <Trash2 size={12} /> Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cơ chế phân trang xem thêm giúp tải 1000 dòng vẫn nhẹ máy */}
            {finalDisplayProducts.length > displayLimit && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setDisplayLimit((prev) => prev + 20)}
                  className="px-6 py-2 border border-orange-500 text-orange-500 hover:bg-orange-50 rounded-md font-semibold text-sm transition"
                >
                  Xem Thêm Linh Kiện (Còn{' '}
                  {finalDisplayProducts.length - displayLimit} mẫu)
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL THÊM / CẬP NHẬT LINH KIỆN */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 bg-orange-500 text-white flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {editingProduct ? 'Cập Nhật Linh Kiện' : 'Thêm Linh Kiện Mới'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  stopCamera();
                }}
                className="hover:bg-black/10 p-1 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Mã Linh Kiện *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: LK-09-LEFT"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={formData.component_code}
                  onChange={(e) =>
                    setFormData({ ...formData, component_code: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Bên Sử Dụng
                </label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={formData.side}
                  onChange={(e) =>
                    setFormData({ ...formData, side: e.target.value as any })
                  }
                >
                  <option value="trái">Trái (Left)</option>
                  <option value="phải">Phải (Right)</option>
                  <option value="cả hai">Cả hai (Universal)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">
                  Đặc trưng chính (Feature)
                </label>
                <textarea
                  rows={2}
                  placeholder="Mô tả nhận diện: 3 lỗ bắt vít, vát cạnh trái..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  value={formData.feature}
                  onChange={(e) =>
                    setFormData({ ...formData, feature: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">
                  Hình Ảnh Linh Kiện
                </label>

                {isCameraActive ? (
                  <div className="relative bg-black rounded-lg overflow-hidden flex flex-col items-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full max-h-60 object-cover"
                    ></video>
                    <div className="absolute bottom-3 flex gap-2">
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                      >
                        <Camera size={20} />
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded"
                      >
                        Tắt Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.previewUrl ? (
                      <div className="relative w-32 h-32 mx-auto rounded-lg overflow-hidden border">
                        <img
                          src={formData.previewUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              imageFile: null,
                              previewUrl: '',
                              imageUrl: '',
                            })
                          }
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-gray-50 transition">
                        <Upload
                          className="mx-auto text-gray-400 mb-2"
                          size={28}
                        />
                        <p className="text-xs text-gray-500">
                          Kéo thả hoặc tải ảnh linh kiện lên
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex items-center gap-1 bg-blue-600 text-white text-xs px-4 py-2 rounded hover:bg-blue-700 transition"
                      >
                        <Camera size={14} /> Chụp Ảnh Trực Tiếp
                      </button>

                      <label className="flex items-center gap-1 bg-gray-200 text-gray-700 text-xs px-4 py-2 rounded hover:bg-gray-300 transition cursor-pointer">
                        <Upload size={14} />
                        <span>Chọn file ảnh từ máy</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setFormData({
                                ...formData,
                                imageFile: file,
                                previewUrl: URL.createObjectURL(file),
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    stopCamera();
                  }}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-semibold hover:bg-orange-600 transition flex items-center gap-1"
                >
                  {loading && <RefreshCw size={12} className="animate-spin" />}
                  <span>{editingProduct ? 'Cập Nhật' : 'Lưu Lại'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
