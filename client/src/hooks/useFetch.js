import { useEffect, useState } from 'react';
import api from '../api/axios';

const useFetch = (url, options = {}, deps = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api(url, options);
        if (!cancelled) {
          setData(res.data?.data ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, setData };
};

export default useFetch;

