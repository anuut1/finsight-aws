import Modal from './Modal';
import ReceiptScannerBox from './ReceiptScannerBox';

const ReceiptScannerModal = ({ isOpen, onClose, onTransactionCreated }) => {
  return (
    <Modal title="🧾 Upload & Scan Receipt (AWS Textract)" isOpen={isOpen} onClose={onClose}>
      <ReceiptScannerBox
        compact
        onTransactionCreated={(newTx) => {
          if (onTransactionCreated) {
            onTransactionCreated(newTx);
          }
          onClose();
        }}
      />
    </Modal>
  );
};

export default ReceiptScannerModal;
