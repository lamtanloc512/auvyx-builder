<?php
/**
 * Render-time CSS (ADR 0001, 0002).
 *
 * For every rendered block with a `auvyx.styles` (or `auvyx.css`) attribute: compile CSS, add the
 * content-hash class to the block's first tag (like core's layout support) and
 * collect the rule. Rules are printed once per page, deduplicated by class.
 *
 * Block themes render the template before wp_head, so rules land in <head>.
 * Classic themes render content later; leftovers are printed in the footer.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Styles;

use Auvyx\Builder\Module;
use Auvyx\Builder\Modules\DesignSystem\DesignSystem;
use Auvyx\Builder\Modules\ThemeAdapter\ThemeTokens;
use Auvyx\Builder\StyleEngine\StyleEngine;

defined( 'ABSPATH' ) || exit;

final class Styles implements Module {

	const HANDLE = 'auvyx-builder-styles';

	/** @var StyleEngine */
	private $engine;

	/** @var DesignSystem */
	private $design_system;

	/** @var array<string, string> class name → CSS */
	private $rules = array();

	/** @var array<string, true> */
	private $printed = array();

	public function __construct( StyleEngine $engine, DesignSystem $design_system ) {
		$this->engine        = $engine;
		$this->design_system = $design_system;
	}

	public function id(): string {
		return 'styles';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_filter( 'render_block', array( $this, 'render_block' ), 10, 2 );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue' ), 100 );
		add_action( 'wp_footer', array( $this, 'print_late_rules' ), 100 );
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render_block( $html, $block ): string {
		$html = (string) $html;
		$name = (string) ( $block['blockName'] ?? '' );
		if ( '' === $html || ( empty( $block['attrs']['auvyx']['styles'] ) && empty( $block['attrs']['auvyx']['css'] ) && ! in_array( $name, self::ROUNDED_BY_DEFAULT, true ) ) ) {
			return $html;
		}
		// The style engine's rules, and the element's own CSS (`auvyx.css`, scoped to it; CustomCss keeps it to users who may write it).
		$compiled = array_filter(
			array(
				empty( $block['attrs']['auvyx']['styles'] ) ? null : $this->engine->compile_block( $block['attrs']['auvyx']['styles'], $this->design_system->breakpoints() ),
				empty( $block['attrs']['auvyx']['css'] ) ? null : $this->engine->compile_scoped_css( $block['attrs']['auvyx']['css'] ),
			)
		);
		// A button converted from core's keeps core's link class: its corners are core's and the theme's, as drawn.
		$core_link = false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'wp-block-button__link' );
		$squircle  = self::squircle( $this->engine->normalize( $block['attrs']['auvyx']['styles'] ?? array() ), in_array( $name, self::ROUNDED_BY_DEFAULT, true ) && ! $core_link );
		if ( array() === $compiled && ! $squircle ) {
			return $html;
		}
		$processor = new \WP_HTML_Tag_Processor( $html );
		if ( ! $processor->next_tag() ) {
			return $html;
		}
		foreach ( $compiled as $rule ) {
			$processor->add_class( $rule['className'] );
			$this->rules[ $rule['className'] ] = $rule['css'];
		}
		if ( $squircle ) {
			$processor->add_class( self::SQUIRCLE );
		}
		if ( ! empty( $compiled[0] ) && ! empty( $block['attrs']['align'] ) && in_array( $block['attrs']['align'], array( 'full', 'wide' ), true ) ) {
			$this->rules[ $compiled[0]['className'] ] .= $this->align_override( $block['attrs']['auvyx']['styles'], $compiled[0]['className'], $block['attrs']['align'] );
		}
		return $processor->get_updated_html();
	}

	/**
	 * Core's layout CSS gives `.alignfull`/`.alignwide` children negative margins and its own max-width with a
	 * higher specificity than our single class, so a full-width section the user narrowed and centered
	 * (max-width + margin-inline:auto) sticks to the left on the front end while the Studio canvas shows it centered.
	 * Re-emit just those declarations under a stronger selector so the element's own values win.
	 *
	 * @param mixed  $input      Raw `auvyx.styles`.
	 * @param string $class_name The block's style class.
	 * @param string $align      `full` or `wide`.
	 */
	private function align_override( $input, string $class_name, string $align ): string {
		$keep   = array( 'margin', 'margin-inline', 'margin-inline-start', 'margin-inline-end', 'max-width' );
		$styles = array();
		foreach ( $this->engine->normalize( $input ) as $breakpoint => $states ) {
			foreach ( $states as $state => $props ) {
				$props = array_intersect_key( $props, array_flip( $keep ) );
				if ( array() !== $props ) {
					$styles[ $breakpoint ][ $state ] = $props;
				}
			}
		}
		return array() === $styles ? '' : $this->engine->compile( $styles, ':root .' . $class_name . '.align' . $align, $this->design_system->breakpoints() );
	}

	/** Smooth corners (blocks.css gives the class `corner-shape: squircle` where the browser has it); Corners.scala. */
	const SQUIRCLE = 'auvyx-squircle';

	/** Blocks blocks.css rounds by default (buttons md, videos lg): smooth unless their own styles set the corners. */
	const ROUNDED_BY_DEFAULT = array( 'auvyx/button', 'auvyx/video' );

	/**
	 * A border-radius value drawn as a squircle: rounded, but not a circle or a pill (the full token, a percentage,
	 * 999px or more) and not square. Same rule as Corners.scala; both read shared/fixtures/corners/cases.json.
	 */
	public static function smooth_corner( string $value ): bool {
		$v = strtolower( trim( $value ) );
		if ( '' === $v || false !== strpos( $v, 'full' ) || false !== strpos( $v, '%' ) ) {
			return false;
		}
		preg_match_all( '/(-?\d*\.?\d+)(px|rem|em|%)?/', $v, $numbers, PREG_SET_ORDER );
		foreach ( $numbers as $m ) {
			if ( (float) $m[1] >= 999 && ( empty( $m[2] ) || 'px' === $m[2] ) ) {
				return false;
			}
		}
		$square = true;
		foreach ( preg_split( '/\s+/', $v ) as $part ) {
			if ( 1 !== preg_match( '/^-?\d*\.?\d+(px|rem|em|%)?$/', $part ) || 0.0 !== (float) $part ) {
				$square = false;
				break;
			}
		}
		return ! $square;
	}

	/**
	 * Whether an element's corners are smooth: its own styles round one (any breakpoint or state) the smooth way, or it
	 * sets none and its block is rounded by default.
	 *
	 * @param array<string, array<string, array<string, string>>> $styles Normalized styles.
	 */
	public static function squircle( array $styles, bool $rounded_by_default = false ): bool {
		$radii = array();
		foreach ( $styles as $states ) {
			foreach ( $states as $declarations ) {
				foreach ( $declarations as $property => $value ) {
					if ( 0 === strpos( (string) $property, 'border' ) && 'radius' === substr( (string) $property, -6 ) ) {
						$radii[] = (string) $value;
					}
				}
			}
		}
		if ( ! $radii ) {
			return $rounded_by_default;
		}
		foreach ( $radii as $value ) {
			if ( self::smooth_corner( $value ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Runs a render and returns its result with the rules of what it rendered, in the order the page would print them
	 * (Auvyx Studio's web canvas: the canvas draws a document the page itself did not render). Rules collected before stay.
	 *
	 * @param callable $render The render.
	 * @return array{0: mixed, 1: string}
	 */
	public function capture( callable $render ): array {
		$saved       = $this->rules;
		$this->rules = array();
		try {
			$result = $render();
			$css    = implode( '', $this->rules );
		} finally {
			$this->rules = array_merge( $saved, $this->rules );
		}
		return array( $result, $css );
	}

	/** Rules collected so far (used by tests and future integrations such as cache plugins). */
	public function collected_css(): string {
		return implode( '', $this->rules );
	}

	/**
	 * The sheet the page prints: the collected rules, then the same rules scoped under an isolated
	 * section so they beat the isolation reset.
	 */
	public function front_css(): string {
		return self::with_isolated_boost( $this->collected_css() );
	}

	/**
	 * @param string $css Compiled block CSS.
	 */
	/**
	 * Where the element rules are printed again, stronger than what themes and blocks.css say inside. A section counts
	 * too: themes that print the content without such a column (Elementor Canvas and Full Width templates, Hello
	 * Elementor's `.page-content`) left a heading's own colour under blocks.css's `color: inherit`.
	 */
	const BOOST = 'html body :is(.entry-content,.wp-block-post-content,.wp-block-template-part,.auvyx-location,.wp-block-auvyx-section)';

	private static function with_isolated_boost( $css ): string {
		$css = (string) $css;
		if ( '' === $css ) {
			return '';
		}
		// Classic themes style `h1` inside `.entry-content` at a higher specificity than one class,
		// so a heading's own margin and size never arrive. The same rules under the content
		// column beat that without changing what the block asked for. The header, the footer and
		// the components placed around the content too, at the specificity of blocks.css's button
		// rule (`body a.wp-block-auvyx-button:not(…)`), which they follow: a button's own background
		// (a text-like link in a header's top bar) was painted over by the primary color.
		return $css . ThemeTokens::boost_isolated( $css ) . ThemeTokens::boost_under( $css, self::BOOST );
	}

	public function enqueue(): void {
		$css = $this->take_unprinted();
		if ( '' === $css ) {
			return;
		}
		$deps = array();
		foreach ( array( 'global-styles', 'auvyx-builder-blocks' ) as $handle ) {
			if ( wp_style_is( $handle, 'registered' ) ) {
				$deps[] = $handle;
			}
		}
		wp_register_style( self::HANDLE, false, $deps, AUVYX_BUILDER_VERSION );
		wp_add_inline_style( self::HANDLE, $css );
		wp_enqueue_style( self::HANDLE );
	}

	public function print_late_rules(): void {
		$css = $this->take_unprinted();
		if ( '' !== $css ) {
			// CSS comes from the style engine (values cannot contain < > { } ;), tags stripped as a second line of defense.
			printf( "<style id=\"%s-late\">%s</style>\n", esc_attr( self::HANDLE ), wp_strip_all_tags( $css ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
	}

	private function take_unprinted(): string {
		$css = '';
		foreach ( $this->rules as $class_name => $rule ) {
			if ( ! isset( $this->printed[ $class_name ] ) ) {
				$this->printed[ $class_name ] = true;
				$css                         .= $rule;
			}
		}
		return self::with_isolated_boost( $css );
	}
}
