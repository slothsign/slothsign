declare module "@trezor/connect-webextension" {
  export interface TrezorConnectManifest {
    email: string;
    appUrl: string;
    appName?: string;
  }

  export interface TrezorConnectResponse<T> {
    success: boolean;
    payload: T | { error: string };
  }

  const TrezorConnect: {
    init(settings: { manifest: TrezorConnectManifest }): Promise<unknown>;
    ethereumSignTransaction(params: {
      path: string;
      transaction: Record<string, unknown>;
    }): Promise<TrezorConnectResponse<{ v: string; r: string; s: string }>>;
    ethereumSignMessage(params: {
      path: string;
      message: string;
      hex?: boolean;
    }): Promise<TrezorConnectResponse<{ address: string; signature: string }>>;
    ethereumSignTypedData(params: {
      path: string;
      data: Record<string, unknown>;
      metamask_v4_compat?: boolean;
    }): Promise<TrezorConnectResponse<{ address: string; signature: string }>>;
    ethereumGetPublicKey(params: { path: string; showOnTrezor?: boolean }): Promise<
      TrezorConnectResponse<{
        path: number[];
        serializedPath: string;
        xpub: string;
      }>
    >;
    ethereumGetAddress(params: {
      path: string;
      showOnDisplay?: boolean;
      keepSession?: boolean;
    }): Promise<
      TrezorConnectResponse<{
        address: string;
        path: number[];
        serializedPath: string;
      }>
    >;
    solanaSignTransaction(params: {
      path: string;
      serializedTx: string;
      serialize?: boolean;
    }): Promise<TrezorConnectResponse<{ signature: string }>>;
    solanaGetAddress(params: {
      path: string;
      showOnTrezor?: boolean;
      keepSession?: boolean;
    }): Promise<
      TrezorConnectResponse<{
        address: string;
        path: number[];
        serializedPath: string;
      }>
    >;
  };

  export default TrezorConnect;
}
