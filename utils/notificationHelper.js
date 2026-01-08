import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../firebaseConfig';

// Konfigurasi Handler (Agar notif muncul pop-up di atas layar)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 1. DAFTARKAN HP USER (Dapatkan Token)
export const registerForPushNotificationsAsync = async (userUid) => {
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      // Alert.alert('Gagal', 'Izin notifikasi diperlukan!');
      return;
    }
    try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        
        // Simpan Token ke Database User
        if (userUid && token) {
            await updateDoc(doc(db, "users", userUid), { expoPushToken: token });
        }
    } catch (e) { console.log("Error Token:", e); }
  } else {
    console.log('Harus pakai HP Fisik untuk notifikasi.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
  return token;
};

// 2. KIRIM NOTIFIKASI
export const sendPushNotification = async (expoPushToken, title, body) => {
  if (!expoPushToken) return;
  
  // Jika token berupa array (kirim banyak sekaligus)
  if (Array.isArray(expoPushToken)) {
      if(expoPushToken.length === 0) return;
      // Loop sederhana (sebaiknya di backend, tapi ini solusi client-side)
      expoPushToken.forEach(async (token) => {
          await sendSingleNotification(token, title, body);
      });
  } else {
      await sendSingleNotification(expoPushToken, title, body);
  }
};

const sendSingleNotification = async (token, title, body) => {
    const message = {
        to: token,
        sound: 'default',
        title: title,
        body: body,
        data: { someData: 'goes here' },
    };

    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
    } catch (error) {
        console.log("Gagal kirim notif:", error);
    }
}

// 3. CARI TOKEN UNTUK SOS (Kirim ke Semua Kecuali Pengirim)
export const getAllOtherTokens = async (excludeUid) => {
    const tokens = [];
    const snap = await getDocs(collection(db, "users"));
    snap.forEach(doc => {
        const d = doc.data();
        if (doc.id !== excludeUid && d.expoPushToken) {
            tokens.push(d.expoPushToken);
        }
    });
    return tokens;
};

// 4. CARI TOKEN PIMPINAN SESUAI DIVISI (REVISI LOGIKA HIERARKI)
export const getLeaderTokensForDivisi = async (applicantDivisi) => {
    const tokens = [];
    let targetRoles = ['kabag_tu']; // Kabag TU selalu dapat notif (backup)

    // Logika Routing Notifikasi Sesuai Request
    if (applicantDivisi === 'security') {
        targetRoles.push('commander');
        targetRoles.push('kasubag_umum');
    } else if (['cleaning', 'driver', 'maintenance', 'pantry'].includes(applicantDivisi)) {
        targetRoles.push('kasubag_umum');
        if (applicantDivisi === 'pantry') targetRoles.push('koordinator');
    } else if (['staf_logistik', 'staf_perlengkapan', 'staf_perkap'].includes(applicantDivisi)) {
        targetRoles.push('kasubag_logistik'); // Khusus Logistik
    } else if (['commander', 'koordinator'].includes(applicantDivisi)) {
        targetRoles.push('kasubag_umum');
    }

    // Ambil Token User yang jabatannya sesuai targetRoles
    if (targetRoles.length > 0) {
        const q = query(collection(db, "users"), where("jabatan", "in", targetRoles));
        const snap = await getDocs(q);
        snap.forEach(doc => {
            const d = doc.data();
            if (d.expoPushToken) tokens.push(d.expoPushToken);
        });
    }
    
    return tokens;
};