import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Game } from './game';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  constructor(private readonly game: Game) {
  }

  ngOnInit() {
    const canvas = this.canvasRef.nativeElement;
    this.game.initialize(canvas);
  }
}
