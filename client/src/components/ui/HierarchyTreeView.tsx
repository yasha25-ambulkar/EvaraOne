import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Building2, User, Cpu, Circle, Router } from 'lucide-react';

interface Device {
    id: string;
    name: string;
    type: string;
    status: string;
    serial_number?: string;
    firmware_version?: string;
    last_seen?: string;
}

interface Customer {
    id: string;
    email: string;
    name?: string;
    status: string;
    devices: Device[];
}

interface Community {
    id: string;
    name: string;
    status: string;
    pincode?: string;
    customers: Customer[];
}

interface Zone {
    id: string;
    name: string;
    state: string;
    country: string;
    communities: Community[];
}

interface HierarchyTreeViewProps {
    data: Zone[];
    onDeviceClick?: (deviceId: string) => void;
    onCustomerClick?: (customerId: string) => void;
}

export default function HierarchyTreeView({ data, onDeviceClick }: Omit<HierarchyTreeViewProps, 'onCustomerClick'>) {
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
    const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set());
    const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

    const toggleRegion = (regionId: string) => {
        setExpandedRegions((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(regionId)) {
                newSet.delete(regionId);
            } else {
                newSet.add(regionId);
            }
            return newSet;
        });
    };

    const toggleCommunity = (communityId: string) => {
        setExpandedCommunities((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(communityId)) {
                newSet.delete(communityId);
            } else {
                newSet.add(communityId);
            }
            return newSet;
        });
    };

    const toggleCustomer = (customerId: string) => {
        setExpandedCustomers((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(customerId)) {
                newSet.delete(customerId);
            } else {
                newSet.add(customerId);
            }
            return newSet;
        });
    };

    const getStatusColor = (status: string) => {
        const statusMap: Record<string, string> = {
            active: 'bg-green-100 text-green-700 border-green-200',
            online: 'bg-green-100 text-green-700 border-green-200',
            inactive: 'bg-gray-100 text-gray-700 border-gray-200',
            offline: 'bg-red-100 text-red-700 border-red-200',
            maintenance: 'bg-yellow-100 text-yellow-700 border-yellow-200',
            suspended: 'bg-orange-100 text-orange-700 border-orange-200',
            pending: 'bg-blue-100 text-blue-700 border-blue-200',
            error: 'bg-red-100 text-red-700 border-red-200',
            unknown: 'bg-gray-100 text-gray-700 border-gray-200',
        };
        return statusMap[status?.toLowerCase()] || statusMap.unknown;
    };

    const DeviceStatusIcon = ({ status }: { status: string }) => {
        const isOnline = status?.toLowerCase() === 'online';
        return (
            <Circle
                className={`${isOnline ? 'text-green-500 fill-green-500' : 'text-gray-400 fill-gray-400'}`}
                size={8}
            />
        );
    };

    return (
        <div className="apple-glass-card rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Router size={20} />
                    Enterprise Hierarchy
                </h2>
                <p className="text-blue-100 text-sm mt-1">Zone → Community → Customer → Device</p>
            </div>

            {/* Tree Content */}
            <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {data.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <Router size={48} className="mx-auto mb-3 opacity-30" />
                        <p className="font-semibold">No data available</p>
                        <p className="text-sm mt-1">Add zones and communities to get started</p>
                    </div>
                ) : (
                    data.map((zone) => {
                        const isRegionExpanded = expandedRegions.has(zone.id);
                        const totalCommunities = zone.communities.length;
                        const totalCustomers = zone.communities.reduce((sum, c) => sum + c.customers.length, 0);
                        const totalDevices = zone.communities.reduce(
                            (sum, c) => sum + c.customers.reduce((s, cu) => s + cu.devices.length, 0),
                            0
                        );

                        return (
                            <div key={zone.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                {/* ZONE LEVEL */}
                                <div
                                    className="flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors"
                                    onClick={() => toggleRegion(zone.id)}
                                >
                                    <button className="flex-shrink-0 text-blue-600">
                                        {isRegionExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </button>
                                    <div className="w-8 h-8 rounded-lg bg-blue-200 flex items-center justify-center flex-shrink-0">
                                        <MapPin size={16} className="text-blue-700" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 truncate">
                                            {zone.name}, {zone.state}
                                        </p>
                                        <p className="text-xs text-slate-600">{zone.country}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-xs apple-glass-card px-2 py-1 rounded-full border border-blue-200">
                                            {totalCommunities} communities
                                        </span>
                                        <span className="text-xs apple-glass-card px-2 py-1 rounded-full border border-blue-200">
                                            {totalCustomers} customers
                                        </span>
                                        <span className="text-xs apple-glass-card px-2 py-1 rounded-full border border-blue-200">
                                            {totalDevices} devices
                                        </span>
                                    </div>
                                </div>

                                {/* COMMUNITIES */}
                                {isRegionExpanded && (
                                    <div className="apple-glass-card">
                                        {zone.communities.length === 0 ? (
                                            <div className="p-4 pl-16 text-sm text-slate-500 italic">
                                                No communities in this zone
                                            </div>
                                        ) : (
                                            zone.communities.map((community) => {
                                                const isCommunityExpanded = expandedCommunities.has(community.id);
                                                const communityCustomers = community.customers.length;
                                                const communityDevices = community.customers.reduce(
                                                    (sum, cu) => sum + cu.devices.length,
                                                    0
                                                );

                                                return (
                                                    <div key={community.id} className="border-t border-slate-100">
                                                        {/* COMMUNITY LEVEL */}
                                                        <div
                                                            className="flex items-center gap-3 p-3 pl-12 apple-glass-card hover:bg-white/30 cursor-pointer transition-colors"
                                                            onClick={() => toggleCommunity(community.id)}
                                                        >
                                                            <button className="flex-shrink-0 text-slate-600">
                                                                {isCommunityExpanded ? (
                                                                    <ChevronDown size={16} />
                                                                ) : (
                                                                    <ChevronRight size={16} />
                                                                )}
                                                            </button>
                                                            <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                                                <Building2 size={14} className="text-purple-600" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-semibold text-slate-800 text-sm truncate">
                                                                    {community.name}
                                                                </p>
                                                                {community.pincode && (
                                                                    <p className="text-xs text-slate-500">
                                                                        PIN: {community.pincode}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <span
                                                                    className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(
                                                                        community.status
                                                                    )}`}
                                                                >
                                                                    {community.status}
                                                                </span>
                                                                <span className="text-xs bg-slate-100 px-2 py-1 rounded-full">
                                                                    {communityCustomers} customers
                                                                </span>
                                                                <span className="text-xs bg-slate-100 px-2 py-1 rounded-full">
                                                                    {communityDevices} devices
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* CUSTOMERS */}
                                                        {isCommunityExpanded && (
                                                            <div className="apple-glass-inner">
                                                                {community.customers.length === 0 ? (
                                                                    <div className="p-3 pl-24 text-sm text-slate-500 italic">
                                                                        No customers in this community
                                                                    </div>
                                                                ) : (
                                                                    community.customers.map((customer) => {
                                                                        const isCustomerExpanded = expandedCustomers.has(
                                                                            customer.id
                                                                        );
                                                                        const customerDevices = customer.devices.length;
                                                                        const onlineDevices = customer.devices.filter(
                                                                            (d) => d.status === 'online'
                                                                        ).length;

                                                                        return (
                                                                            <div
                                                                                key={customer.id}
                                                                                className="border-t border-slate-200"
                                                                            >
                                                                                {/* CUSTOMER LEVEL */}
                                                                                <div
                                                                                    className="flex items-center gap-3 p-3 pl-24 apple-glass-inner hover:bg-slate-100 cursor-pointer transition-colors"
                                                                                    onClick={() =>
                                                                                        toggleCustomer(customer.id)
                                                                                    }
                                                                                >
                                                                                    <button className="flex-shrink-0 text-slate-600">
                                                                                        {isCustomerExpanded ? (
                                                                                            <ChevronDown size={14} />
                                                                                        ) : (
                                                                                            <ChevronRight size={14} />
                                                                                        )}
                                                                                    </button>
                                                                                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                                                                        <User
                                                                                            size={12}
                                                                                            className="text-green-600"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <p className="font-semibold text-slate-800 text-xs truncate">
                                                                                            {customer.name || customer.email}
                                                                                        </p>
                                                                                        {customer.name && (
                                                                                            <p className="text-xs text-slate-500 truncate">
                                                                                                {customer.email}
                                                                                            </p>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                                                        <span
                                                                                            className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(
                                                                                                customer.status
                                                                                            )}`}
                                                                                        >
                                                                                            {customer.status}
                                                                                        </span>
                                                                                        {customerDevices > 0 && (
                                                                                            <span className="text-xs apple-glass-card px-2 py-0.5 rounded-full border border-slate-300">
                                                                                                {onlineDevices}/{customerDevices}{' '}
                                                                                                online
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                {/* DEVICES */}
                                                                                {isCustomerExpanded && (
                                                                                    <div className="apple-glass-card">
                                                                                        {customer.devices.length === 0 ? (
                                                                                            <div className="p-3 pl-36 text-xs text-slate-500 italic">
                                                                                                No devices
                                                                                            </div>
                                                                                        ) : (
                                                                                            customer.devices.map((device) => (
                                                                                                <div
                                                                                                    key={device.id}
                                                                                                    className="flex items-center gap-3 p-2 pl-36 hover:bg-blue-50 cursor-pointer transition-colors border-t border-slate-100"
                                                                                                    onClick={() =>
                                                                                                        onDeviceClick?.(
                                                                                                            device.id
                                                                                                        )
                                                                                                    }
                                                                                                >
                                                                                                    <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                                                                        <Cpu
                                                                                                            size={10}
                                                                                                            className="text-slate-600"
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="flex-1 min-w-0">
                                                                                                        <p className="font-medium text-slate-700 text-xs truncate">
                                                                                                            {device.name}
                                                                                                        </p>
                                                                                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                                                            {device.serial_number && (
                                                                                                                <span>
                                                                                                                    SN:{' '}
                                                                                                                    {device.serial_number}
                                                                                                                </span>
                                                                                                            )}
                                                                                                            {device.firmware_version && (
                                                                                                                <span>
                                                                                                                    FW:{' '}
                                                                                                                    {device.firmware_version}
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                                                                        <DeviceStatusIcon
                                                                                                            status={device.status}
                                                                                                        />
                                                                                                        <span
                                                                                                            className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(
                                                                                                                device.status
                                                                                                            )}`}
                                                                                                        >
                                                                                                            {device.status}
                                                                                                        </span>
                                                                                                        {device.type && (
                                                                                                            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">
                                                                                                                {device.type}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
