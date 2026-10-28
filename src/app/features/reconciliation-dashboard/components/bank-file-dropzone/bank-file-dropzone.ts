import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';

const ACCEPTED_EXTENSIONS = ['.xlsx'];

/**
 * Zona para arrastrar o elegir el extracto bancario (.xlsx) y nombre del archivo cargado.
 *
 * @remarks Valida la extensión también al arrastrar, porque `accept` solo filtra el selector.
 * @see docs/codigo/conciliacion.md#extracto-bancario
 */
@Component({
  selector: 'app-bank-file-dropzone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bank-file-dropzone.html',
  styleUrl: './bank-file-dropzone.scss',
})
export class BankFileDropzone {
  /** Archivo ya cargado, para mostrar su nombre. */
  readonly file = input<File | null>(null);
  readonly selected = output<File>();

  private readonly message = inject(NzMessageService);
  protected readonly dragOver = signal(false);

  protected onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.accept(input.files?.[0]);
    // Permite volver a elegir el mismo archivo después de un rechazo.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  // `dragleave` también salta sobre los hijos: solo cuenta si el cursor sale del contenedor.
  protected onDragLeave(event: DragEvent): void {
    const container = event.currentTarget as Node;
    if (!container.contains(event.relatedTarget as Node | null)) this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.accept(event.dataTransfer?.files?.[0]);
  }

  protected formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private accept(file: File | undefined): void {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      this.message.error('El archivo bancario debe ser un .xlsx.');
      return;
    }
    this.selected.emit(file);
  }
}
