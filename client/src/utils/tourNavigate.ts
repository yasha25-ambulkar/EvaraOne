import type { NavigateFunction } from 'react-router-dom';

let _navigate: NavigateFunction | null = null;

export const setTourNavigate = (fn: NavigateFunction) => {
    _navigate = fn;
};

export const tourNavigate = (path: string) => {
    if (_navigate) {
        _navigate(path);
    }
};
