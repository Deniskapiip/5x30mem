export type ControllerType = 'camera' | 'sensor' | 'gate' | 'other';

export type ControllerStatus = 'online' | 'offline' | 'maintenance';

export type Controller = {
  id: string;
  title: string;
  description: string;
  type: ControllerType;
  status: ControllerStatus;
  lat: number;
  lng: number;
  created_at: string;
};

export type ControllerInsert = Omit<Controller, 'id' | 'created_at'>;

export const controllerTypes: ControllerType[] = ['camera', 'sensor', 'gate', 'other'];
export const controllerStatuses: ControllerStatus[] = ['online', 'offline', 'maintenance'];
