declare module 'next/image' {
  import type { ForwardRefExoticComponent, ImgHTMLAttributes, RefAttributes } from 'react';
  const Image: ForwardRefExoticComponent<ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; sizes?: string } & RefAttributes<HTMLImageElement>>;
  export default Image;
}
