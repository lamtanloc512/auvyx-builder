<?php
/**
 * Composition root: builds modules, checks requirements, registers hooks.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder;

use Auvyx\Builder\Modules\Ai\Ai;
use Auvyx\Builder\Modules\Data\Data;
use Auvyx\Builder\Modules\Blocks\Blocks;
use Auvyx\Builder\Modules\Components\Components;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;
use Auvyx\Builder\Modules\Patterns\Patterns;
use Auvyx\Builder\Modules\Studio\Studio;
use Auvyx\Builder\Modules\Styles\Styles;
use Auvyx\Builder\Modules\VisualBuilder\VisualBuilder;
use Auvyx\Builder\StyleEngine\StyleEngine;

defined( 'ABSPATH' ) || exit;

final class Plugin {

	/** @var Plugin|null */
	private static $instance;

	/** @var array<string, Module> */
	private $modules = array();

	/** @var bool */
	private $booted = false;

	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	public function boot(): void {
		if ( $this->booted ) {
			return;
		}
		$this->booted = true;

		$design_system = new DesignSystem( self::shared_data( 'design-system' ) );
		$style_engine  = new StyleEngine( self::shared_data( 'css-properties' )['properties'] );

		$components = new Components();
		$studio     = new Studio( $design_system, $components );

		$modules = array(
			$design_system,
			new Styles( $style_engine, $design_system ),
			new Blocks( $design_system ),
			new Patterns(),
			$components,
			new VisualBuilder( $design_system, $components ),
			$studio,
			new \Auvyx\Builder\Modules\Editor\Editor( $studio ),
			new \Auvyx\Builder\Modules\StudioExtensions\StudioExtensions(),
			new Ai(),
			new \Auvyx\Builder\Modules\Ai\Gateway(),
			new \Auvyx\Builder\Modules\Ai\Sessions(),
			new Data(),
			new \Auvyx\Builder\Modules\Edition\Edition(),
			new \Auvyx\Builder\Modules\Forms\Forms(),
			new \Auvyx\Builder\Modules\Slider\Slider(),
			new \Auvyx\Builder\Modules\Animate\Animate(),
			new \Auvyx\Builder\Modules\Header\Header(),
			new \Auvyx\Builder\Modules\PageTitle\PageTitle(),
			new \Auvyx\Builder\Modules\ThemeBuilder\ThemeBuilder( $components ),
			new \Auvyx\Builder\Modules\Tabs\Tabs(),
			new \Auvyx\Builder\Modules\Widgets\Widgets(),
			new \Auvyx\Builder\Modules\SiteTools\SiteTools(),
			new \Auvyx\Builder\Modules\Gallery\Gallery(),
			new \Auvyx\Builder\Modules\CustomCss\CustomCss(),
			new \Auvyx\Builder\Modules\DataSources\DataSources(),
			new \Auvyx\Builder\Modules\ContentTypes\ContentTypes(),
			new \Auvyx\Builder\Modules\NavDrawer\NavDrawer(),
			new \Auvyx\Builder\Modules\CodeElement\CodeElement(),
			new \Auvyx\Builder\Modules\Sandbox\SandboxCode(),
			new \Auvyx\Builder\Modules\ThemeAdapter\ThemeAdapter( $style_engine, $design_system ),
			new \Auvyx\Builder\Modules\Play\Play(),
			new \Auvyx\Builder\Modules\SiteTemplates\SiteTemplates(),
			new \Auvyx\Builder\Modules\DemoCatalog\DemoCatalog(),
			new \Auvyx\Builder\Modules\VideoAutoplay\VideoAutoplay(),
			new \Auvyx\Builder\Modules\LoopMore\LoopMore(),
			new \Auvyx\Builder\Modules\CanvasWeb\CanvasWeb(),
			new \Auvyx\Builder\Modules\Live\Live(),
			new \Auvyx\Builder\Modules\MediaImport\MediaImport(),
			new \Auvyx\Builder\Modules\BlankPage\BlankPage(),
			new \Auvyx\Builder\Modules\Mcp\Mcp(),
			new \Auvyx\Builder\Modules\McpAccess\McpAccess(),
		);

		/**
		 * Filters the modules Auvyx Builder boots. Add-ons append their own Module instances here.
		 *
		 * @param Module[] $modules
		 */
		$modules = apply_filters( 'auvyx_builder_modules', $modules );

		foreach ( $modules as $module ) {
			if ( $module instanceof Module && self::requirements_met( $module->requires() ) ) {
				$this->modules[ $module->id() ] = $module;
				$module->register();
			}
		}
	}

	public function module( string $id ): ?Module {
		return $this->modules[ $id ] ?? null;
	}

	/**
	 * Data generated from shared/*.json by tools/build-shared.ts (PHP arrays, opcache friendly).
	 *
	 * @return array<string, mixed>
	 */
	public static function shared_data( string $name ): array {
		return require AUVYX_BUILDER_DIR . 'generated/' . $name . '.php';
	}

	/**
	 * @param array{wp?: string, php?: string} $requires Requirements.
	 */
	private static function requirements_met( array $requires ): bool {
		global $wp_version;
		if ( isset( $requires['php'] ) && version_compare( PHP_VERSION, $requires['php'], '<' ) ) {
			return false;
		}
		if ( isset( $requires['wp'] ) && version_compare( (string) $wp_version, $requires['wp'], '<' ) ) {
			return false;
		}
		return true;
	}
}
