import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plus, Search, Camera, Trash2, Edit2, LogOut, Upload, Sparkles, 
  RefreshCw, Image as ImageIcon, X, ZoomIn, ZoomOut, RotateCw
} from 'lucide-react';

const SUPABASE_URL = 'https://vhsikdgkzecdfopkpzum.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoc2lrZGdremVjZGZvcGtwenVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjgyMTcsImV4cCI6MjA5Njg0NDIxN30.bj1yl4azsk8X-V2I1C6l5Qpa0kqt6j0TP4ZCJ3Du0l4'; // Key của anh
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- TYPES ---
interface Product {
  id: string;
  component_code: string;
  feature: string;
  side: 'trái' | 'phải' | 'cả hai';
  user_id: string;
}

interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  similarity?: number;
}

interface FullProduct extends Product {
  image_url: string;
  similarity?: number;
}

// --- UTILS ---
const compressImage = async (file: File): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1024;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(new File([blob!], 'compressed.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.8);
      };
    };
  });
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<FullProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  
  // State cho form nhiều ảnh
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    component_code: '', feature: '', side: 'cả hai' as any, files: [] as File[]
  });

  // AI Worker Ref
  const workerRef = useRef<Worker | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSide, setFilterSide] = useState('tất cả');

  // Kính lúp states
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // 1. Khởi tạo Auth
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    
    // 2. Khởi tạo Web Worker cho AI
    workerRef.current = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current.postMessage({ type: 'LOAD_MODEL' });
    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'MODEL_READY') setAiStatus('ready');
      if (e.data.type === 'ERROR') setAiStatus('error');
    };

    return () => workerRef.current?.terminate();
  }, []);

  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('products').select('*, product_images(image_url)').order('created_at', { ascending: false });
    const formatted = (data as any[]).map(p => ({ ...p, image_url: p.product_images?.[0]?.image_url }));
    setProducts(formatted);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchProducts(); }, [user]);

  // Hàm lấy vector từ Worker (Promise wrapper)
  const getVector = (imageUrl: string): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      workerRef.current?.postMessage({ type: 'EXTRACT_VECTOR', image: imageUrl });
      workerRef.current!.onmessage = (e) => {
        if (e.data.type === 'VECTOR_READY') resolve(e.data.vector);
        if (e.data.type === 'ERROR') reject(e.data.error);
      };
    });
  };

const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert('Vui lòng đăng nhập lại!');
    if (formData.files.length === 0) return alert('Vui lòng thêm ít nhất 1 ảnh!');
    setLoading(true);

    try {
      console.log("1. Bắt đầu lưu sản phẩm cho user:", user.id);
      
      // Bước 1: Lưu vào bảng products
      const { data: productData, error: pErr } = await supabase
        .from('products')
        .insert([{ 
          component_code: formData.component_code, 
          feature: formData.feature, 
          side: formData.side, 
          user_id: user.id 
        }])
        .select();

      console.log("2. Kết quả trả về từ Supabase:", productData);

      if (pErr) {
        console.error("Lỗi Insert:", pErr);
        throw new Error(`Lỗi database: ${pErr.message}`);
      }

      if (!productData || productData.length === 0) {
        console.error("LỖI NGHIÊM TRỌNG: Supabase không trả về ID sản phẩm!");
        throw new Error("Hệ thống không thể lấy ID sản phẩm. Vui lòng chạy lại SQL tắt RLS.");
      }

      const product = productData[0];
      console.log("3. Đã lấy được ID sản phẩm:", product.id);

      // Bước 2: Xử lý từng ảnh
   const imagePayloads = await Promise.all(
  formData.files.map(async (file,index)=>{

      const compressed =
      await compressImage(file);

      const vector =
      await clipService.extractVector(
          compressed
      );

      const path =
      `${user.id}/${crypto.randomUUID()}.jpg`;

      await supabase.storage
      .from("product-images")
      .upload(path, compressed);

      const { data } =
      supabase.storage
      .from("product-images")
      .getPublicUrl(path);

      return {
          product_id: product.id,
          image_url: data.publicUrl,
          embedding: vector
      };
  })
);

      // Bước 3: Lưu hàng loạt ảnh vào product_images
      const { error: imgErr } = await supabase.from('product_images').insert(imagePayloads);
      if (imgErr) throw imgErr;

      alert('Lưu linh kiện thành công!');
      setFormData({ component_code: '', feature: '', side: 'cả hai', files: [] });
      setShowAddModal(false);
      fetchProducts();
    } catch (err: any) {
      console.error("Full Error Log:", err);
      alert('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

 const handleAiSearch = async (
  e: React.ChangeEvent<HTMLInputElement>
) => {

  const file = e.target.files?.[0];

  if (!file) return;

  setLoading(true);

  try {

    const compressed =
      await compressImage(file);

    const vector =
      await clipService.extractVector(
        compressed
      );

    const { data, error } =
      await supabase.rpc(
        'match_images',
        {
          query_embedding: vector,
          match_threshold: 0.3,
          match_count: 10
        }
      );

    if (error) {
      throw error;
    }

    setProducts(data as FullProduct[]);

  } catch (err: any) {

    alert(
      'Lỗi AI: ' +
      err.message
    );

  } finally {

    setLoading(false);

  }
};
  // --- ZOOM LOGIC (Giữ nguyên như bản trước) ---
  const handleOpenZoom = (url: string) => { setZoomImage(url); setScale(1); setRotation(0); setPosition({ x: 0, y: 0 }); };
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <header className="bg-[#ee4d2d] text-white py-4 px-6 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="text-yellow-300" size={28} />
            <h1 className="text-xl font-bold uppercase">Hệ Thống AI Tra Cứu</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`text-xs px-3 py-1 rounded-full flex items-center gap-2 ${aiStatus === 'ready' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}>
              <RefreshCw size={12} className={aiStatus === 'loading' ? 'animate-spin' : ''} />
              {aiStatus === 'loading' ? 'Đang tải Model CLIP...' : 'AI Sẵn Sàng'}
            </div>
            <button onClick={() => supabase.auth.signOut()} className="bg-black/20 p-2 rounded"><LogOut size={18}/></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-6">
        {/* Toolbar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-2 overflow-x-auto">
            {['tất cả', 'trái', 'phải', 'cả hai'].map(s => (
              <button key={s} onClick={() => setFilterSide(s)} className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize border transition ${filterSide === s ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'}`}>{s}</button>
            ))}
          </div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-yellow-600">
              <Camera size={16}/> Tìm bằng AI
              <input type="file" className="hidden" onChange={handleAiSearch} accept="image/*" />
            </label>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700">
              <Plus size={16}/> Thêm Linh Kiện
            </button>
          </div>
        </div>

        {/* Grid Products */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map(p => (
            <div key={p.id} className="bg-white rounded-lg shadow-sm border overflow-hidden group relative">
              <div onClick={() => p.image_url && handleOpenZoom(p.image_url)} className="aspect-square bg-gray-100 cursor-zoom-in overflow-hidden">
                <img src={p.image_url} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />
                <span className="absolute bottom-2 right-2 bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold">{p.side}</span>
                {p.similarity && <span className="absolute top-2 left-2 bg-green-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">Khớp {Math.round(p.similarity * 100)}%</span>}
              </div>
              <div className="p-3">
                <h3 className="text-sm font-bold truncate">Mã: {p.component_code}</h3>
                <p className="text-xs text-gray-500 line-clamp-2">{p.feature}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal Thêm mới nhiều ảnh */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-orange-500 text-white flex justify-between font-bold">
              <span>Thêm Linh Kiện (Đa góc chụp)</span>
              <X className="cursor-pointer" onClick={() => setShowAddModal(false)} />
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <input 
                className="w-full p-2 border rounded-lg" 
                placeholder="Mã linh kiện..." 
                value={formData.component_code} 
                onChange={e => setFormData({...formData, component_code: e.target.value})} 
                required 
              />
              <select 
                className="w-full p-2 border rounded-lg" 
                value={formData.side} 
                onChange={e => setFormData({...formData, side: e.target.value as any})}
              >
                <option value="trái">Trái</option>
                <option value="phải">Phải</option>
                <option value="cả hai">Cả Hai</option>
              </select>
              <textarea 
                className="w-full p-2 border rounded-lg" 
                placeholder="Đặc trưng..." 
                value={formData.feature} 
                onChange={e => setFormData({...formData, feature: e.target.value})} 
              />
              
              <div>
                <label className="block text-xs font-bold mb-2 uppercase text-gray-500">Hình ảnh (Tối đa 4 góc chụp chuẩn)</label>
                <div className="grid grid-cols-3 gap-2">
                  {formData.files.map((f, i) => (
                    <div key={i} className="relative aspect-square border rounded-lg overflow-hidden bg-gray-100">
                      <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" />
                      <X size={14} className="absolute top-1 right-1 bg-red-500 text-white rounded-full cursor-pointer" onClick={() => setFormData({...formData, files: formData.files.filter((_, idx) => idx !== i)})} />
                    </div>
                  ))}
                  {formData.files.length < 4 && (
                    <label className="aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 text-gray-400">
                      <Plus size={20} />
                      <span className="text-[10px]">Thêm ảnh</span>
                      <input type="file" className="hidden" multiple onChange={e => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files);
                          setFormData({...formData, files: [...formData.files, ...newFiles].slice(0, 4)});
                        }
                      }} />
                    </label>
                  )}
                </div>
                <p className="text-[10px] text-orange-600 mt-2">* Lưu ý: Chụp vật thể nằm phẳng, vuông góc 90 độ để AI chính xác nhất.</p>
              </div>

              <button disabled={loading} className="w-full py-3 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600 disabled:bg-gray-300 transition">
                {loading ? 'Đang xử lý AI & Tải lên...' : 'Lưu Linh Kiện'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Kính lúp (Giữ nguyên logic) */}
      {zoomImage && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center select-none">
          <X className="absolute top-6 right-6 text-white cursor-pointer" onClick={() => setZoomImage(null)} />
          <div 
            className="relative flex-1 w-full flex items-center justify-center cursor-move"
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)}
            onTouchStart={(e) => { 
              setIsDragging(true); 
              const t = e.touches[0]; 
              setDragStart({ x: t.clientX - position.x, y: t.clientY - position.y }); 
            }}
            onTouchMove={(e) => {
              if (!isDragging) return;
              const t = e.touches[0];
              setPosition({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
            }}
            onTouchEnd={() => setIsDragging(false)}
          >
            <img 
              src={zoomImage} 
              className="transition-transform duration-100 shadow-2xl" 
              style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale}) rotate(${rotation}deg)`, maxHeight: '80vh' }} 
            />
          </div>
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-full flex gap-6 text-white mb-8">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}><ZoomOut/></button>
            <span className="font-mono">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(5, s + 0.25))}><ZoomIn/></button>
            <div className="w-[1px] bg-white/20 h-6" />
            <button onClick={() => setRotation(r => (r + 90) % 360)} className="flex items-center gap-1"><RotateCw size={16}/> Xoay</button>
            <button onClick={() => { setScale(1); setRotation(0); setPosition({x:0,y:0}) }} className="text-xs font-bold uppercase">Đặt lại</button>
          </div>
        </div>
      )}
    </div>
  );
}
