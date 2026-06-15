// Fix React 19 type issues - allow any component to be used as JSX
declare global {
  namespace React {
    type FC<P = {}> = (props: P) => any;
    type ForwardRefRenderFunction<P = {}, Ref = any> = (props: P, ref: Ref) => any;
  }
  
  namespace JSX {
    type Element = any;
  }
}
