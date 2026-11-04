<?php
/**
 * A game's document and the policy it is served with (docs/play-sandbox.md), from shared/play.json. The Studio and
 * EzyPlatform have the same in Scala (PlayDocument.scala); shared/fixtures/play/cases.json keeps them equal. Nothing is
 * cut here: a game over the limits is refused when it is saved (over_limit).
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\Play;

use Auvyx\Builder\Plugin;

defined( 'ABSPATH' ) || exit;

final class PlayDocument {

	/**
	 * The libraries a game may use, from what it names: known and allowed in the sandbox, once each, in order.
	 *
	 * @param string[] $names What the game names.
	 * @return string[]
	 */
	public static function libs( array $names ): array {
		$allowed = array();
		foreach ( Plugin::shared_data( 'code-libraries' )['libraries'] as $library ) {
			if ( $library['sandbox'] ) {
				$allowed[] = $library['name'];
			}
		}
		$out = array();
		foreach ( $names as $name ) {
			$name = (string) $name;
			if ( in_array( $name, $allowed, true ) && ! in_array( $name, $out, true ) ) {
				$out[] = $name;
			}
		}
		return $out;
	}

	private static function escape( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', true );
	}

	/**
	 * The document, filled in one pass (a placeholder inside the game's content stays as it is).
	 *
	 * @param array{title: string, lang?: string, html?: string, css?: string, js?: string, libs?: string[]} $game    The game.
	 * @param string                                                                                     $runtime The game runtime's address.
	 */
	public static function render( array $game, string $runtime ): string {
		$lang   = (string) ( $game['lang'] ?? 'en' );
		$values = array(
			'lang'    => preg_match( '/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/D', $lang ) ? $lang : 'en',
			'title'   => self::escape( (string) $game['title'] ),
			'css'     => (string) preg_replace( '#</(style)#i', '<\\/$1', (string) ( $game['css'] ?? '' ) ),
			'html'    => (string) ( $game['html'] ?? '' ),
			'config'  => str_replace( '<', '\\u003c', (string) wp_json_encode( array( 'libs' => self::libs( (array) ( $game['libs'] ?? array() ) ) ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ),
			'js'      => str_replace( '<!--', '<\\!--', (string) preg_replace( '#</(script)#i', '<\\/$1', (string) ( $game['js'] ?? '' ) ) ),
			'runtime' => self::escape( $runtime ),
		);
		return (string) preg_replace_callback(
			'/\{(lang|title|css|html|config|js|runtime)\}/',
			static function ( array $m ) use ( $values ): string {
				return $values[ $m[1] ];
			},
			Plugin::shared_data( 'play' )['document']
		);
	}

	/** The Content-Security-Policy header: this site's origin may frame it, the runtime script comes from `runtime_origin`. */
	public static function csp( string $site_origin, string $runtime_origin ): string {
		$play  = Plugin::shared_data( 'play' );
		$parts = array( 'sandbox ' . implode( ' ', $play['sandbox'] ) );
		foreach ( $play['csp'] as $name => $sources ) {
			$filled = array();
			foreach ( $sources as $source ) {
				$filled[] = str_replace( array( '{site-origin}', '{runtime-origin}' ), array( $site_origin, $runtime_origin ), $source );
			}
			$parts[] = $name . ' ' . implode( ' ', $filled );
		}
		return implode( '; ', $parts );
	}

	/**
	 * A game on a page: its poster and a play button; play-page.js puts the sandboxed frame in on press. Same as
	 * PlayElement.embed in Scala (shared/fixtures/play/cases.json, "embeds").
	 *
	 * @param array{id: string, title: string, src: string, poster?: string, assets?: array<int, array{name: string, type: string, url: string}>} $game  The game.
	 * @param string                                                                                                                             $label The play button's text.
	 */
	public static function embed( array $game, string $label ): string {
		$play   = Plugin::shared_data( 'play' );
		$assets = array();
		foreach ( (array) ( $game['assets'] ?? array() ) as $asset ) {
			$assets[] = array(
				'name' => (string) $asset['name'],
				'type' => (string) $asset['type'],
				'url'  => (string) $asset['url'],
			);
		}
		$config = array(
			'id'     => (string) $game['id'],
			'title'  => (string) $game['title'],
			'src'    => (string) $game['src'],
			'assets' => $assets,
		);
		$poster = (string) ( $game['poster'] ?? '' );
		$values = array(
			'config' => self::escape( (string) wp_json_encode( $config, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) ),
			'poster' => '' === $poster ? '' : str_replace( '{src}', self::escape( $poster ), $play['poster'] ),
			'label'  => self::escape( $label ),
		);
		return (string) preg_replace_callback(
			'/\{(config|poster|label)\}/',
			static function ( array $m ) use ( $values ): string {
				return $values[ $m[1] ];
			},
			$play['embed']
		);
	}

	/**
	 * The first part over its limit, as a message, or null.
	 *
	 * @param array{html?: string, css?: string, js?: string} $game The game.
	 */
	public static function over_limit( array $game ): ?string {
		$limits = Plugin::shared_data( 'play' )['limits'];
		foreach ( array( 'html', 'css', 'js' ) as $part ) {
			if ( self::length( (string) ( $game[ $part ] ?? '' ) ) > $limits[ $part ] ) {
				/* translators: 1: a part of a game (html, css, js), 2: a number of characters. */
				return sprintf( __( 'The game\'s %1$s is over %2$d characters.', 'auvyx-builder' ), $part, $limits[ $part ] );
			}
		}
		return null;
	}

	/** Length in UTF-16 code units, as the Studio (Scala/JS) counts it. */
	private static function length( string $text ): int {
		return (int) ( strlen( (string) mb_convert_encoding( $text, 'UTF-16LE', 'UTF-8' ) ) / 2 );
	}
}
