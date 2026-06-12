import { useState, useEffect } from "react";
import { deviceService, type MapDevice } from "../services/realtime/DeviceService";
import { useAuth } from "../context/AuthContext";

export type { MapDevice };

/**
 * Hook to fetch all devices for map display with real-time updates directly from Firestore
 */
export const useMapDevices = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState<MapDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const communityId = user?.role === "customer" ? user.community_id : undefined;
  const isCustomer = user?.role === "customer";

  useEffect(() => {
    // No more blocking loading state - persistence will provide cached data instantly
    const unsubscribe = deviceService.subscribeToMapNodes((data) => {
      console.log('MAP DEBUG:', data.map(d => ({ 
        name: d.name, 
        showMap: d.showMap, 
        isVisibleToCustomer: d.isVisibleToCustomer 
      })));

      setDevices(
        isCustomer
          ? data.filter(device => device.customer_config?.showMap !== false && device.isVisibleToCustomer !== false)
          : data
      );
      setIsLoading(false);
    }, communityId);

    return () => unsubscribe();
  }, [communityId, isCustomer]);

  return { data: devices, isLoading };
};
