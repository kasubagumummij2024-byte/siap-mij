import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@laporan_pending';

// 1. Simpan Laporan ke "Gudang" (HP)
export const simpanLaporanOffline = async (dataLaporan) => {
  try {
    // Ambil dulu data lama (jika ada)
    const existingData = await AsyncStorage.getItem(STORAGE_KEY);
    let newReports = existingData ? JSON.parse(existingData) : [];

    // Tambahkan data baru ke antrean
    newReports.push(dataLaporan);

    // Simpan kembali ke HP
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newReports));
    console.log('Laporan berhasil disimpan offline!');
  } catch (e) {
    console.error('Gagal menyimpan offline:', e);
  }
};

// 2. Ambil Semua Laporan Pending
export const ambilLaporanPending = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : [];
  } catch (e) {
    console.error('Gagal mengambil data:', e);
    return [];
  }
};

// 3. Hapus Laporan dari "Gudang" (Dipakai setelah sukses kirim ke server)
export const hapusLaporanPending = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch(e) {
    console.error('Gagal menghapus cache:', e);
  }
};