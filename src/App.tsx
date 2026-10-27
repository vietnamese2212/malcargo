import { useEffect, useRef } from 'react'
import { Shell } from './ui/Shell'
import { useRoute } from './ui/route'
import { newId, newTripLabel, useData } from './data/store'
import TripPage from './pages/TripPage'
import OrdersPage from './pages/OrdersPage'
import OrderPage from './pages/OrderPage'
import ItemsPage from './pages/ItemsPage'
import VehiclesPage from './pages/VehiclesPage'
import AccountPage from './pages/AccountPage'

/** Mở app = vào thẳng bàn xếp xe của chuyến sửa gần nhất; chưa có chuyến nào thì tạo sẵn một chuyến trống. */
function Home() {
  const trips = useData(s => s.trips)
  const upsertTrip = useData(s => s.upsertTrip)
  useEffect(() => {
    const latest = [...trips].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    let id = latest?.id
    if (!id) {
      id = newId()
      upsertTrip({ id, ...newTripLabel([]), vehicleId: null, orderIds: [], updatedAt: 0 })
    }
    window.location.replace(`#/trip/${id}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function App() {
  const route = useRoute()
  // Chuyến mẫu vừa tách thành chuyến mới: GIỮ nguyên màn chuyến (bảng đang mở, ô đang gõ), chỉ đổi id;
  // mọi lần đổi chuyến khác thì dựng màn mới như thường.
  const rid = route.page === 'trip' ? route.id : ''
  const prev = useRef(rid), tripKey = useRef(rid)
  if (rid !== prev.current) {
    const f = useData.getState().fork
    if (!(f && f.from === prev.current && f.to === rid)) tripKey.current = rid
    prev.current = rid
  }
  return (
    <Shell>
      {route.page === 'trips' && <Home />}
      {route.page === 'trip' && <TripPage key={tripKey.current} id={route.id} />}
      {route.page === 'orders' && <OrdersPage />}
      {route.page === 'order' && <OrderPage key={route.id} id={route.id} back={route.back} />}
      {route.page === 'items' && <ItemsPage />}
      {route.page === 'vehicles' && <VehiclesPage />}
      {route.page === 'account' && <AccountPage />}
    </Shell>
  )
}
