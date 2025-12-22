import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebaseConfig'; // Sesuaikan path jika beda

const STORAGE_KEY = '@laporan_pending';

// Fungsi Helper: Ubah URI Lokal jadi Blob (Sama seperti di ReportModal)
const uriToBlob = (uri) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function (e) {
      console.log(e);
      reject(new TypeError("Network request failed"));
    };
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
};

export const syncData = async () => {
  try {
    // 1. Ambil data dari gudang offline
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    let pendingReports = jsonValue != null ? JSON.parse(jsonValue) : [];

    if (pendingReports.length === 0) return 0; // Tidak ada data, selesai.

    console.log(`[AutoSync] Menemukan ${pendingReports.length} laporan tertunda...`);

    const failedReports = [];
    let successCount = 0;

    // 2. Loop semua laporan pending
    for (const report of pendingReports) {
      try {
        console.log(`[AutoSync] Mengupload laporan milik: ${report.userName}`);

        // A. Upload Foto ke Firebase Storage
        // Kita harus convert URI lokal (file://) jadi Blob lagi
        const blob = await uriToBlob(report.localImageUri);
        
        const filename = `laporan/${report.userId}_sync_${Date.now()}.jpg`;
        const storageRef = ref(storage, filename);
        
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
        blob.close(); // Penting: Tutup blob untuk hemat memori
        
        const downloadURL = await getDownloadURL(storageRef);

        // B. Simpan Data ke Firestore
        await addDoc(collection(db, "reports"), {
          userId: report.userId,
          userName: report.userName,
          userDivisi: report.userDivisi,
          locationId: report.locationId,
          locationName: report.locationName,
          description: report.description,
          photoUrl: downloadURL, // Pakai URL online yang baru didapat
          timestamp: serverTimestamp(), // Waktu server saat sinkronisasi
          date: new Date().toISOString().split('T')[0], // Tanggal hari ini
          source: 'offline_sync' // Penanda data ini hasil sync
        });

        // C. Update Poin User
        const userRef = doc(db, "users", report.userId);
        await updateDoc(userRef, { total_poin: increment(10) });

        successCount++;
      } catch (error) {
        console.error(`[AutoSync] Gagal upload satu item:`, error);
        // Jika gagal, masukkan kembali ke antrean failed
        failedReports.push(report);
      }
    }

    // 3. Update Storage
    // Jika ada yang gagal, simpan balik sisanya. Jika sukses semua, array kosong.
    if (failedReports.length > 0) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(failedReports));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY); // Bersih total
    }

    return successCount;

  } catch (e) {
    console.error("[AutoSync] Error System:", e);
    return 0;
  }
};