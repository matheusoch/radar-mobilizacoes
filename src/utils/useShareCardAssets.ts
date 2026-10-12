import {useEffect, useState} from 'react';
import {loadShareCardAssets, type ShareCardAssets} from './shareCardGenerator';

export function useShareCardAssets(): ShareCardAssets | null {
  const [assets, setAssets] = useState<ShareCardAssets | null>(null);

  useEffect(() => {
    let active = true;
    loadShareCardAssets()
      .then(loaded => {
        if (active) setAssets(loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return assets;
}
